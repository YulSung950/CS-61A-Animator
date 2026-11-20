//# sourceMappingURL=data.mjs.map
import * as $json from "../gleam_json/gleam/json.mjs";
import * as $decode from "../gleam_stdlib/gleam/dynamic/decode.mjs";
import * as $list from "../gleam_stdlib/gleam/list.mjs";
import * as $result from "../gleam_stdlib/gleam/result.mjs";
import {
  storageGet as storage_get,
  storageSet as storage_set,
  schedulePersist as schedule_persist,
  persistNow as persist_now,
  setSelectValue as set_select_value,
  promptDrawingName as prompt_drawing_name,
} from "./data_ffi.mjs";
import * as $examples from "./examples.mjs";
import {
  Ok,
  Error,
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  CustomType as $CustomType,
} from "./gleam.mjs";

export {
  persist_now,
  prompt_drawing_name,
  schedule_persist,
  set_select_value,
  storage_get,
  storage_set,
};

export class Library extends $CustomType {
  constructor(drawings, current) {
    super();
    this.drawings = drawings;
    this.current = current;
  }
}
export const Library$Library = (drawings, current) =>
  new Library(drawings, current);
export const Library$isLibrary = (value) => value instanceof Library;
export const Library$Library$drawings = (value) => value.drawings;
export const Library$Library$0 = (value) => value.drawings;
export const Library$Library$current = (value) => value.current;
export const Library$Library$1 = (value) => value.current;

/**
 * localStorage key for the whole library blob (drawings + last-open name).
 */
export const library_key = "animator-drawing-library";

/**
 * Starter source for a newly created drawing.
 */
export const new_drawing_stub = "fn draw(shape_slider: Int) -> List(Path) {\n  []\n}\n";

/**
 * JSON: `{"current":"fan","drawings":[["fan","fn draw…"], …]}` — sources are
 * plain text, including unsaved / invalid edits.
 */
export function encode(library) {
  let drawings_json = $list.map(
    library.drawings,
    (entry) => {
      let name = entry[0];
      let source = entry[1];
      return $json.preprocessed_array(
        listPrepend(
          $json.string(name),
          listPrepend($json.string(source), $List$Empty$const),
        ),
      );
    },
  );
  let _pipe = $json.object(
    listPrepend(
      ["current", $json.string(library.current)],
      listPrepend(
        ["drawings", $json.preprocessed_array(drawings_json)],
        $List$Empty$const,
      ),
    ),
  );
  return $json.to_string(_pipe);
}

/**
 * Look up a drawing's source by name.
 */
export function find_source(drawings, name) {
  return $list.find_map(
    drawings,
    (entry) => {
      let n = entry[0];
      let source = entry[1];
      let $ = n === name;
      if ($) {
        return new Ok(source);
      } else {
        return new Error(undefined);
      }
    },
  );
}

function normalize_current(library) {
  let $ = find_source(library.drawings, library.current);
  if ($ instanceof Ok) {
    return library;
  } else {
    let $1 = library.drawings;
    if ($1 instanceof $Empty) {
      return library;
    } else {
      let name = $1.head[0];
      return new Library(library.drawings, name);
    }
  }
}

function library_decoder() {
  return $decode.field(
    "current",
    $decode.string,
    (current) => {
      return $decode.field(
        "drawings",
        $decode.list(pair_decoder()),
        (drawings) => { return $decode.success(new Library(drawings, current)); },
      );
    },
  );
}

export function decode(raw) {
  let _pipe = $json.parse(raw, library_decoder());
  let _pipe$1 = $result.replace_error(_pipe, undefined);
  return $result.try$(
    _pipe$1,
    (lib) => {
      let $ = lib.drawings;
      if ($ instanceof $Empty) {
        return new Error(undefined);
      } else {
        return new Ok(normalize_current(lib));
      }
    },
  );
}

function pair_decoder() {
  let _pipe = $decode.list($decode.string);
  return $decode.then$(
    _pipe,
    (items) => {
      if (items instanceof $Empty) {
        return $decode.failure(["", ""], "drawing pair");
      } else {
        let $ = items.tail;
        if ($ instanceof $Empty) {
          return $decode.failure(["", ""], "drawing pair");
        } else if ($.tail instanceof $Empty) {
          let name = items.head;
          let source = $.head;
          return $decode.success([name, source]);
        } else {
          return $decode.failure(["", ""], "drawing pair");
        }
      }
    },
  );
}

/**
 * Replace the source for `name`, or append if it is new.
 */
export function upsert(drawings, name, source) {
  let $ = $list.any(drawings, (entry) => { return entry[0] === name; });
  if ($) {
    return $list.map(
      drawings,
      (entry) => {
        let $1 = entry[0] === name;
        if ($1) {
          return [name, source];
        } else {
          return entry;
        }
      },
    );
  } else {
    return $list.append(
      drawings,
      listPrepend([name, source], $List$Empty$const),
    );
  }
}

/**
 * Seed from `examples.all` and persist. Used when storage is empty or corrupt.
 */
export function seed_from_examples() {
  let drawings = $examples.all;
  let _block;
  if (drawings instanceof $Empty) {
    _block = "untitled";
  } else {
    let name = drawings.head[0];
    _block = name;
  }
  let current = _block;
  let library = new Library(drawings, current);
  persist_now(library_key, encode(library));
  return library;
}

/**
 * Load the library from localStorage, or seed from examples when missing.
 */
export function load() {
  let $ = storage_get(library_key);
  if ($ instanceof Ok) {
    let raw = $[0];
    let $1 = decode(raw);
    if ($1 instanceof Ok) {
      let library = $1[0];
      return library;
    } else {
      return seed_from_examples();
    }
  } else {
    return seed_from_examples();
  }
}

/**
 * Persist immediately (cancels any pending debounced write).
 */
export function save_now(library) {
  return persist_now(library_key, encode(library));
}

/**
 * Autosave within `delay_ms` (use ≤ 3000 for edit autosave).
 */
export function save_soon(library, delay_ms) {
  return schedule_persist(library_key, encode(library), delay_ms);
}
