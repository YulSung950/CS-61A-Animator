//// The library of saved drawings. A drawing is a name and the source of its draw
//// function.

import examples
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/result

/// localStorage key for the whole library blob (drawings + last-open name).
pub const library_key = "animator-drawing-library"

/// Starter source for a newly created drawing.
pub const new_drawing_stub = "fn draw(shape_slider: Int) -> List(Path) {\n  []\n}\n"

/// In-memory / persisted library: named sources plus which name is open.
pub type Library {
  Library(drawings: List(#(String, String)), current: String)
}

// ── localStorage (data_ffi.mjs) ───────────────────────────────────────────────

/// The string stored in localStorage under key, or an Error if there isn't one.
@external(javascript, "./data_ffi.mjs", "storageGet")
pub fn storage_get(key: String) -> Result(String, Nil)

/// Store value in localStorage under key, replacing anything already there. If that
/// isn't possible, this logs the reason to the browser console.
@external(javascript, "./data_ffi.mjs", "storageSet")
pub fn storage_set(key: String, value: String) -> Nil

/// Debounced write: replaces any pending write for this key and runs within
/// `delay_ms` (callers should pass ≤ 3000 for edit autosave).
@external(javascript, "./data_ffi.mjs", "schedulePersist")
pub fn schedule_persist(key: String, value: String, delay_ms: Int) -> Nil

/// Cancel a pending debounced write and store immediately.
@external(javascript, "./data_ffi.mjs", "persistNow")
pub fn persist_now(key: String, value: String) -> Nil

/// Force a `<select data-test-id=…>` back to `value` (used when create-new is cancelled).
@external(javascript, "./data_ffi.mjs", "setSelectValue")
pub fn set_select_value(test_id: String, value: String) -> Nil

// ── The new-drawing prompt (data_ffi.mjs) ─────────────────────────────────────

/// Prompt the user to name a new drawing; "" (empty string) means they
/// cancelled or left it blank.
@external(javascript, "./data_ffi.mjs", "promptDrawingName")
pub fn prompt_drawing_name() -> String

// ── Encode / decode ───────────────────────────────────────────────────────────

/// JSON: `{"current":"fan","drawings":[["fan","fn draw…"], …]}` — sources are
/// plain text, including unsaved / invalid edits.
pub fn encode(library: Library) -> String {
  let drawings_json =
    list.map(library.drawings, fn(entry) {
      let #(name, source) = entry
      json.preprocessed_array([json.string(name), json.string(source)])
    })
  json.object([
    #("current", json.string(library.current)),
    #("drawings", json.preprocessed_array(drawings_json)),
  ])
  |> json.to_string
}

fn pair_decoder() -> decode.Decoder(#(String, String)) {
  decode.list(decode.string)
  |> decode.then(fn(items) {
    case items {
      [name, source] -> decode.success(#(name, source))
      _ -> decode.failure(#("", ""), "drawing pair")
    }
  })
}

fn library_decoder() -> decode.Decoder(Library) {
  use current <- decode.field("current", decode.string)
  use drawings <- decode.field("drawings", decode.list(pair_decoder()))
  decode.success(Library(drawings:, current:))
}

pub fn decode(raw: String) -> Result(Library, Nil) {
  json.parse(raw, library_decoder())
  |> result.replace_error(Nil)
  |> result.try(fn(lib) {
    case lib.drawings {
      [] -> Error(Nil)
      _ -> Ok(normalize_current(lib))
    }
  })
}

fn normalize_current(library: Library) -> Library {
  case find_source(library.drawings, library.current) {
    Ok(_) -> library
    Error(_) ->
      case library.drawings {
        [#(name, _), ..] -> Library(..library, current: name)
        [] -> library
      }
  }
}

/// Look up a drawing's source by name.
pub fn find_source(
  drawings: List(#(String, String)),
  name: String,
) -> Result(String, Nil) {
  list.find_map(drawings, fn(entry) {
    let #(n, source) = entry
    case n == name {
      True -> Ok(source)
      False -> Error(Nil)
    }
  })
}

/// Replace the source for `name`, or append if it is new.
pub fn upsert(
  drawings: List(#(String, String)),
  name: String,
  source: String,
) -> List(#(String, String)) {
  case list.any(drawings, fn(entry) { entry.0 == name }) {
    True ->
      list.map(drawings, fn(entry) {
        case entry.0 == name {
          True -> #(name, source)
          False -> entry
        }
      })
    False -> list.append(drawings, [#(name, source)])
  }
}

/// Seed from `examples.all` and persist. Used when storage is empty or corrupt.
pub fn seed_from_examples() -> Library {
  let drawings = examples.all
  let current = case drawings {
    [#(name, _), ..] -> name
    [] -> "untitled"
  }
  let library = Library(drawings:, current:)
  persist_now(library_key, encode(library))
  library
}

/// Merge any example drawings missing from a stored library (e.g. new seeds
/// like `house`, `grid_8x8`) so they show up in drawing-select without wiping
/// edits.
pub fn merge_example_seeds(
  drawings: List(#(String, String)),
) -> List(#(String, String)) {
  list.fold(examples.all, drawings, fn(acc, entry) {
    let #(name, source) = entry
    case find_source(acc, name) {
      Ok(_) -> acc
      Error(_) -> list.append(acc, [#(name, source)])
    }
  })
}

/// Load the library from localStorage, or seed from examples when missing.
pub fn load() -> Library {
  case storage_get(library_key) {
    Error(_) -> seed_from_examples()
    Ok(raw) ->
      case decode(raw) {
        Ok(library) -> {
          let drawings = merge_example_seeds(library.drawings)
          case drawings == library.drawings {
            True -> library
            False -> {
              let library = Library(..library, drawings:)
              persist_now(library_key, encode(library))
              library
            }
          }
        }
        Error(_) -> seed_from_examples()
      }
  }
}

/// Persist immediately (cancels any pending debounced write).
pub fn save_now(library: Library) -> Nil {
  persist_now(library_key, encode(library))
}

/// Autosave within `delay_ms` (use ≤ 3000 for edit autosave).
pub fn save_soon(library: Library, delay_ms: Int) -> Nil {
  schedule_persist(library_key, encode(library), delay_ms)
}
