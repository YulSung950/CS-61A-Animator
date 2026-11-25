//// Animator -- an application for program-generated drawings.

import builtins
import data.{type Library, Library}
import drawing
import editor
import errors
import gleam/float
import gleam/int
import gleam/list
import gleam/result
import lustre
import lustre/attribute as attr
import lustre/effect.{type Effect}
import lustre/element.{type Element}
import lustre/element/html
import lustre/event
import parser
import render
import shape.{type Path}

//

/// Your app's public address, once you've deployed it in Problem 13, such as
/// "https://your-username.github.io/animator/".
pub const public_url = ""

/// Set to True if you would like your app's URL included in the course gallery.
pub const include_app_in_gallery = False

/// A link to your video from Problem 14, which anyone with the link can watch.
pub const video_url = ""

/// Set to True if you would like your video included in the course gallery.
pub const include_video_in_gallery = False

/// Autosave debounce for editor edits (must stay within 3s).
const autosave_ms = 800

/// Default shape-slider position (reference range [0, 100]).
const default_shape_slider = 10

/// Default playback rate: 1.0× forward (matches canvas.mjs startup).
const default_speed = 1.0

/// Speed track spans this many× normal on each side of pause (0).
const speed_max = 2.0

/// Default music-sync sensitivity (0.05–1.5).
const default_music_sensitivity = 0.55

// ── Model ──────────────────────────────────────────────────────────────────────

pub type DuelMode {
  VsAi
  Hotseat
}

pub type Model {
  Model(
    // The code in the editor.
    source: String,
    // Whether the code editor is shown.
    code_open: Bool,
    // Latest parse/eval error message, or "" when the last run succeeded /
    // the overlay was dismissed. Shown as a canvas overlay toast.
    error: String,
    // Value passed into draw as shape_slider.
    shape_slider: Int,
    // Playback rate passed to render.set_speed (negative = reverse).
    speed: Float,
    // Saved drawings + which one is open (also mirrored in localStorage).
    library: Library,
    // Extension 6: mirror duel on the current path.
    duel_on: Bool,
    duel_mode: DuelMode,
    duel_status: String,
    // Extension 10: music sync.
    music_on: Bool,
    music_sensitivity: Float,
    music_bass_link: Bool,
  )
}

pub type Msg {
  /// Editor keystroke / remount callback. On failure, keep the prior drawing.
  SetCode(String)

  /// Load a named library entry into the editor. On failure, clear the canvas.
  OpenDrawing(String)

  // Layout controls
  ToggleCode

  // Clear the canvas error overlay (Esc, dismiss button, or backdrop click).
  DismissError

  // Control strip
  SetShapeSlider(Int)
  SetSpeed(Float)

  // Drawing library menu (`data-test-id="drawing-select"`).
  // Empty string = create-new option.
  SelectDrawing(String)

  // Mirror duel
  ToggleDuel
  SetDuelMode(DuelMode)
  DuelStatus(String)

  // Music sync
  ToggleMusic
  MusicPlaying(Bool)
  SetMusicSensitivity(Float)
  ToggleBassLink
  MusicBass(Int)
}

@external(javascript, "./app_ffi.mjs", "listenEscape")
fn listen_escape(on_escape: fn() -> Nil) -> Nil

@external(javascript, "./app_ffi.mjs", "setDuelEnabled")
fn set_duel_enabled(on: Bool) -> Nil

@external(javascript, "./app_ffi.mjs", "setDuelMode")
fn set_duel_mode_js(mode: String) -> Nil

@external(javascript, "./app_ffi.mjs", "listenDuelStatus")
fn listen_duel_status(on_status: fn(String) -> Nil) -> Nil

@external(javascript, "./app_ffi.mjs", "setMusicSensitivity")
fn set_music_sensitivity_js(s: Float) -> Nil

@external(javascript, "./app_ffi.mjs", "setMusicBassLink")
fn set_music_bass_link_js(on: Bool) -> Nil

@external(javascript, "./app_ffi.mjs", "setMusicBaseSpeed")
fn set_music_base_speed_js(rate: Float) -> Nil

@external(javascript, "./app_ffi.mjs", "wireMusicCallbacks")
fn wire_music_callbacks(
  on_bass: fn(Int) -> Nil,
  on_pulse: fn(Float) -> Nil,
) -> Nil

@external(javascript, "./app_ffi.mjs", "toggleMusic")
fn toggle_music_js() -> Nil

@external(javascript, "./app_ffi.mjs", "pauseMusic")
fn pause_music_js() -> Nil

@external(javascript, "./app_ffi.mjs", "useBuiltinMusic")
fn use_builtin_music_js() -> Nil

@external(javascript, "./app_ffi.mjs", "bindMusicFileInput")
fn bind_music_file_input(id: String) -> Nil

// ── Init ───────────────────────────────────────────────────────────────────────

pub fn init(_flags: Nil) -> #(Model, Effect(Msg)) {
  let library = data.load()
  let source = case data.find_source(library.drawings, library.current) {
    Ok(src) -> src
    Error(_) -> data.new_drawing_stub
  }
  let model =
    Model(
      source:,
      code_open: True,
      error: "",
      shape_slider: default_shape_slider,
      speed: default_speed,
      library:,
      duel_on: False,
      duel_mode: VsAi,
      duel_status: "",
      music_on: False,
      music_sensitivity: default_music_sensitivity,
      music_bass_link: False,
    )
  // Mount + open the restored drawing. On parse/eval failure: show code +
  // overlay and clear the canvas (no stale paths).
  #(
    model,
    effect.batch([
      editor.mount(source, SetCode),
      effect.from(fn(dispatch) { dispatch(OpenDrawing(source)) }),
      listen_esc(),
      wire_extensions(),
    ]),
  )
}

fn listen_esc() -> Effect(Msg) {
  effect.from(fn(dispatch) { listen_escape(fn() { dispatch(DismissError) }) })
}

fn wire_extensions() -> Effect(Msg) {
  effect.from(fn(dispatch) {
    listen_duel_status(fn(label) { dispatch(DuelStatus(label)) })
    set_music_sensitivity_js(default_music_sensitivity)
    set_music_base_speed_js(default_speed)
    wire_music_callbacks(
      fn(shape) { dispatch(MusicBass(shape)) },
      // Pulse updates canvas speed in JS; Gleam keeps the user base rate.
      fn(_) { Nil },
    )
    bind_music_file_input("music-file")
    use_builtin_music_js()
  })
}

// Parse and evaluate a draw function at the given shape-slider value, returning
// the rendered paths on success, or a human-readable message on failure.
fn run_source(shape_slider: Int, source: String) -> Result(List(Path), String) {
  case parser.parse_program(source, builtins.global_frame()) {
    Error(msg) -> Error(msg)
    Ok(program) ->
      drawing.try_draw(shape_slider, program)
      // Convert Error(EvalError) to Error(String) with a useful error message.
      |> result.map_error(errors.error_message)
  }
}

fn paint_paths(paths: List(Path), reset: Bool) -> Effect(Msg) {
  let rendered =
    list.map(paths, fn(path) { render.render_path(path, "#ffffff") })
  effect.from(fn(_) {
    render.set_drawing(rendered)
    case reset {
      True -> render.reset_clock()
      False -> Nil
    }
  })
}

/// Empty the canvas (used when opening a bad drawing).
fn clear_canvas() -> Effect(Msg) {
  effect.from(fn(_) {
    render.set_drawing([])
    render.reset_clock()
  })
}

fn with_library_source(model: Model, source: String) -> Model {
  let drawings =
    data.upsert(model.library.drawings, model.library.current, source)
  let library = Library(drawings:, current: model.library.current)
  Model(..model, source:, library:)
}

fn persist_soon(library: Library) -> Effect(Msg) {
  effect.from(fn(_) { data.save_soon(library, autosave_ms) })
}

fn persist_now(library: Library) -> Effect(Msg) {
  effect.from(fn(_) { data.save_now(library) })
}

fn duel_mode_name(mode: DuelMode) -> String {
  case mode {
    VsAi -> "ai"
    Hotseat -> "hotseat"
  }
}

// ── Update ─────────────────────────────────────────────────────────────────────

pub fn update(model: Model, msg: Msg) -> #(Model, Effect(Msg)) {
  case msg {
    ToggleCode -> #(Model(..model, code_open: !model.code_open), effect.none())

    DismissError -> #(Model(..model, error: ""), effect.none())

    // After each keystroke in the editor, evaluate user code and animate
    // its paths, or show the canvas error overlay on failure. Edits are
    // written into the in-memory library immediately and autosaved soon,
    // even when the code is invalid.
    SetCode(text) -> {
      let model = with_library_source(model, text)
      let save = persist_soon(model.library)
      case run_source(model.shape_slider, text) {
        Ok(paths) -> #(
          Model(..model, error: ""),
          // Replace the drawing and restart the clock so the new paths
          // animate from the beginning at the current speed.
          effect.batch([save, paint_paths(paths, True)]),
        )
        // Keep the previous drawing; do not call set_drawing. Overlay shows
        // the error over the dimmed canvas until the next success or dismiss.
        Error(msg) -> #(Model(..model, error: msg), save)
      }
    }

    // Restore / menu switch / new drawing: same as SetCode on success, but
    // clear the canvas on failure so a bad open never leaves stale paths.
    OpenDrawing(text) -> {
      let model = with_library_source(model, text)
      let save = persist_now(model.library)
      case run_source(model.shape_slider, text) {
        Ok(paths) -> #(
          Model(..model, error: ""),
          effect.batch([save, paint_paths(paths, True)]),
        )
        Error(msg) -> #(
          Model(..model, error: msg),
          effect.batch([save, clear_canvas()]),
        )
      }
    }

    // Shape slider: re-run draw at the new Int; clock keeps running.
    SetShapeSlider(value) ->
      case run_source(value, model.source) {
        Ok(paths) -> #(
          Model(..model, error: "", shape_slider: value),
          paint_paths(paths, False),
        )
        Error(msg) -> #(
          Model(..model, error: msg, shape_slider: value),
          effect.none(),
        )
      }

    // Speed slider: bipolar rate; midpoint ≈ 0 pauses.
    SetSpeed(rate) -> #(
      Model(..model, speed: rate),
      effect.from(fn(_) {
        render.set_speed(rate)
        set_music_base_speed_js(rate)
      }),
    )

    SelectDrawing("") -> handle_create_new(model)

    SelectDrawing(name) -> switch_to_drawing(model, name)

    ToggleDuel -> {
      let on = !model.duel_on
      #(
        Model(..model, duel_on: on, duel_status: case on {
          True -> "Mirror duel · A/D or ←/→ · Space rematch"
          False -> ""
        }),
        effect.from(fn(_) {
          set_duel_enabled(on)
          set_duel_mode_js(duel_mode_name(model.duel_mode))
        }),
      )
    }

    SetDuelMode(mode) -> #(
      Model(..model, duel_mode: mode),
      effect.from(fn(_) { set_duel_mode_js(duel_mode_name(mode)) }),
    )

    DuelStatus(label) -> #(Model(..model, duel_status: label), effect.none())

    ToggleMusic -> #(
      model,
      effect.from(fn(dispatch) {
        // toggleMusic is async in JS; fire-and-forget then flip from callback
        // by reading playing state via a small delay is awkward, so we optimistically
        // toggle and let MusicPlaying correct if needed.
        let next = !model.music_on
        case next {
          True -> {
            toggle_music_js()
            dispatch(MusicPlaying(True))
          }
          False -> {
            pause_music_js()
            dispatch(MusicPlaying(False))
          }
        }
      }),
    )

    MusicPlaying(on) -> #(Model(..model, music_on: on), effect.none())

    SetMusicSensitivity(s) -> #(
      Model(..model, music_sensitivity: s),
      effect.from(fn(_) { set_music_sensitivity_js(s) }),
    )

    ToggleBassLink -> {
      let on = !model.music_bass_link
      #(
        Model(..model, music_bass_link: on),
        effect.from(fn(_) { set_music_bass_link_js(on) }),
      )
    }

    // Optional bass → shape_slider (only while music + bass-link are on).
    MusicBass(value) ->
      case model.music_on && model.music_bass_link {
        False -> #(model, effect.none())
        True ->
          case value == model.shape_slider {
            True -> #(model, effect.none())
            False ->
              case run_source(value, model.source) {
                Ok(paths) -> #(
                  Model(..model, error: "", shape_slider: value),
                  paint_paths(paths, False),
                )
                Error(msg) -> #(
                  Model(..model, error: msg, shape_slider: value),
                  effect.none(),
                )
              }
          }
      }
  }
}

fn handle_create_new(model: Model) -> #(Model, Effect(Msg)) {
  case data.prompt_drawing_name() {
    "" -> #(
      model,
      effect.from(fn(_) {
        data.set_select_value("drawing-select", model.library.current)
      }),
    )
    name ->
      case data.find_source(model.library.drawings, name) {
        // Name already exists: just open it (do not overwrite).
        Ok(_) -> switch_to_drawing(model, name)
        Error(_) -> {
          let drawings =
            data.upsert(
              model.library.drawings,
              name,
              data.new_drawing_stub,
            )
          let library = Library(drawings:, current: name)
          let source = data.new_drawing_stub
          let model = Model(..model, library:, source:, error: "")
          #(
            model,
            effect.batch([
              persist_now(library),
              editor.mount(source, SetCode),
              effect.from(fn(dispatch) { dispatch(OpenDrawing(source)) }),
            ]),
          )
        }
      }
  }
}

fn switch_to_drawing(model: Model, name: String) -> #(Model, Effect(Msg)) {
  // Flush current edits into the library entry being left, then open `name`.
  let drawings =
    data.upsert(model.library.drawings, model.library.current, model.source)
  case data.find_source(drawings, name) {
    Error(_) -> #(model, effect.none())
    Ok(source) -> {
      let library = Library(drawings:, current: name)
      let model = Model(..model, library:, source:)
      #(
        model,
        effect.batch([
          persist_now(library),
          editor.mount(source, SetCode),
          effect.from(fn(dispatch) { dispatch(OpenDrawing(source)) }),
        ]),
      )
    }
  }
}

// ── View ──────────────────────────────────────────────────────────────────
//
// Two side-by-side panes: the code editor on the left and its rendered output on
// the right. The code column can be hidden to expand the right pane.

pub fn view(model: Model) -> Element(Msg) {
  let app_class = case model.code_open {
    True -> "app"
    False -> "app code-hidden"
  }
  // The code column still exists even when hidden (CSS collapses it) so the
  // mounted CodeMirror editor keeps its state across show/hide.
  html.div([attr.class(app_class)], [
    html.div([attr.class("code-col")], [
      editor.view_panel(
        ToggleCode,
        model.library.drawings,
        model.library.current,
        SelectDrawing,
      ),
    ]),
    view_anim(model),
  ])
}

fn view_anim(model: Model) -> Element(Msg) {
  let area_class = case model.error {
    "" -> "canvas-area"
    _ -> "canvas-area has-error"
  }
  // Canvas stage above; control strip docked underneath (not over the canvas).
  // Error overlay lives inside the stage so sliders stay usable while fixing.
  html.div([attr.class(area_class)], [
    view_reveal_code(model),
    html.div([attr.class("canvas-stage")], [
      html.canvas([attr.id("animation-canvas"), attr.class("canvas")]),
      view_duel_hud(model),
      view_error_overlay(model.error),
    ]),
    view_control_strip(model),
  ])
}

fn view_duel_hud(model: Model) -> Element(Msg) {
  case model.duel_on {
    False -> element.none()
    True ->
      html.div([attr.class("duel-hud"), attr.attribute("data-test-id", "duel-hud")], [
        html.span([attr.class("duel-hud-label")], [html.text(model.duel_status)]),
      ])
  }
}

/// Under-canvas strip: Shape → draw(shape_slider); Speed → set_speed(rate);
/// plus Mirror duel + Music sync extension controls.
fn view_control_strip(model: Model) -> Element(Msg) {
  html.div([attr.class("control-strip")], [
    view_shape_row(model.shape_slider),
    view_speed_row(model.speed),
    view_duel_row(model),
    view_music_row(model),
  ])
}

fn view_shape_row(shape_slider: Int) -> Element(Msg) {
  html.div([attr.class("control-row")], [
    html.label([attr.class("control-label"), attr.for("shape-slider")], [
      html.text("Shape"),
    ]),
    html.input([
      attr.type_("range"),
      attr.id("shape-slider"),
      attr.attribute("data-test-id", "shape-slider"),
      attr.class("control-slider"),
      attr.min("0"),
      attr.max("100"),
      attr.step("1"),
      attr.value(int.to_string(shape_slider)),
      event.on_input(fn(raw) {
        case int.parse(raw) {
          Ok(n) -> SetShapeSlider(n)
          Error(_) -> SetShapeSlider(shape_slider)
        }
      }),
    ]),
    html.span([attr.class("control-value")], [
      html.text(int.to_string(shape_slider)),
    ]),
  ])
}

fn view_speed_row(speed: Float) -> Element(Msg) {
  html.div([attr.class("control-row control-row-speed")], [
    html.label([attr.class("control-label"), attr.for("speed-slider")], [
      html.text("Speed"),
    ]),
    html.div([attr.class("speed-track-wrap")], [
      html.input([
        attr.type_("range"),
        attr.id("speed-slider"),
        attr.attribute("data-test-id", "speed-slider"),
        attr.class("control-slider speed-slider"),
        attr.min(float.to_string(0.0 -. speed_max)),
        attr.max(float.to_string(speed_max)),
        attr.step("0.1"),
        attr.value(float.to_string(speed)),
        event.on_input(fn(raw) {
          // Range inputs often stringify whole numbers as "2" / "-2" with no
          // decimal. gleam/float.parse requires "\d+.\d+", so fall back to int.
          case float.parse(raw) {
            Ok(rate) -> SetSpeed(rate)
            Error(_) ->
              case int.parse(raw) {
                Ok(n) -> SetSpeed(int.to_float(n))
                Error(_) -> SetSpeed(speed)
              }
          }
        }),
      ]),
      html.div([attr.class("speed-legend")], [
        html.text("◀ reverse · ▶ fwd"),
      ]),
    ]),
    html.span([attr.class("control-value")], [
      html.text(format_speed(speed)),
    ]),
  ])
}

fn view_duel_row(model: Model) -> Element(Msg) {
  let toggle_label = case model.duel_on {
    True -> "Exit duel"
    False -> "Mirror duel"
  }
  html.div([attr.class("control-row control-row-ext")], [
    html.span([attr.class("control-label")], [html.text("Duel")]),
    html.div([attr.class("ext-controls")], [
      html.button(
        [
          attr.class(case model.duel_on {
            True -> "ext-btn ext-btn-on"
            False -> "ext-btn"
          }),
          attr.attribute("type", "button"),
          attr.attribute("data-test-id", "duel-toggle"),
          event.on_click(ToggleDuel),
        ],
        [html.text(toggle_label)],
      ),
      html.button(
        [
          attr.class(case model.duel_on, model.duel_mode {
            True, VsAi -> "ext-btn ext-btn-on"
            _, _ -> "ext-btn"
          }),
          attr.attribute("type", "button"),
          attr.attribute("data-test-id", "duel-mode-ai"),
          attr.disabled(!model.duel_on),
          event.on_click(SetDuelMode(VsAi)),
        ],
        [html.text("vs AI")],
      ),
      html.button(
        [
          attr.class(case model.duel_on, model.duel_mode {
            True, Hotseat -> "ext-btn ext-btn-on"
            _, _ -> "ext-btn"
          }),
          attr.attribute("type", "button"),
          attr.attribute("data-test-id", "duel-mode-hotseat"),
          attr.disabled(!model.duel_on),
          event.on_click(SetDuelMode(Hotseat)),
        ],
        [html.text("Hot-seat")],
      ),
    ]),
    html.span([attr.class("control-value ext-hint")], [
      html.text(case model.duel_on {
        True -> "A/D"
        False -> ""
      }),
    ]),
  ])
}

fn view_music_row(model: Model) -> Element(Msg) {
  let play_label = case model.music_on {
    True -> "Pause"
    False -> "Play"
  }
  html.div([attr.class("control-row control-row-ext control-row-music")], [
    html.span([attr.class("control-label")], [html.text("Music")]),
    html.div([attr.class("ext-controls music-controls")], [
      html.button(
        [
          attr.class(case model.music_on {
            True -> "ext-btn ext-btn-on"
            False -> "ext-btn"
          }),
          attr.attribute("type", "button"),
          attr.attribute("data-test-id", "music-toggle"),
          event.on_click(ToggleMusic),
        ],
        [html.text(play_label)],
      ),
      html.label([attr.class("ext-file-label")], [
        html.text("File"),
        html.input([
          attr.type_("file"),
          attr.id("music-file"),
          attr.attribute("data-test-id", "music-file"),
          attr.attribute("accept", "audio/*"),
          attr.class("ext-file-input"),
        ]),
      ]),
      html.label([attr.class("music-sens-label"), attr.for("music-sensitivity")], [
        html.text("Sens"),
      ]),
      html.input([
        attr.type_("range"),
        attr.id("music-sensitivity"),
        attr.attribute("data-test-id", "music-sensitivity"),
        attr.class("control-slider music-sens"),
        attr.min("0.05"),
        attr.max("1.5"),
        attr.step("0.05"),
        attr.value(float.to_string(model.music_sensitivity)),
        event.on_input(fn(raw) {
          case float.parse(raw) {
            Ok(s) -> SetMusicSensitivity(s)
            Error(_) ->
              case int.parse(raw) {
                Ok(n) -> SetMusicSensitivity(int.to_float(n))
                Error(_) -> SetMusicSensitivity(model.music_sensitivity)
              }
          }
        }),
      ]),
      html.button(
        [
          attr.class(case model.music_bass_link {
            True -> "ext-btn ext-btn-on"
            False -> "ext-btn"
          }),
          attr.attribute("type", "button"),
          attr.attribute("data-test-id", "music-bass-link"),
          attr.attribute("title", "Map bass energy to the shape slider"),
          event.on_click(ToggleBassLink),
        ],
        [html.text("Bass→Shape")],
      ),
    ]),
    html.span([attr.class("control-value")], [
      html.text(format_sens(model.music_sensitivity)),
    ]),
  ])
}

fn format_speed(rate: Float) -> String {
  float.to_string(rate) <> "×"
}

fn format_sens(s: Float) -> String {
  float.to_string(s)
}

/// Semi-transparent toast centered over the canvas. Backdrop click or the
/// Dismiss button clears it; Esc is handled globally in init.
fn view_error_overlay(error: String) -> Element(Msg) {
  case error {
    "" -> element.none()
    msg ->
      html.div(
        [attr.class("error-overlay"), attr.attribute("role", "alert")],
        [
          // Full-bleed dimmer; click dismisses without covering the toast.
          html.div(
            [
              attr.class("error-overlay-backdrop"),
              event.on_click(DismissError),
            ],
            [],
          ),
          html.div([attr.class("error-toast")], [
            html.div([attr.class("error-toast-title")], [
              html.text("Couldn't draw"),
            ]),
            html.pre([attr.class("error-toast-msg")], [html.text(msg)]),
            html.button(
              [
                attr.class("error-toast-dismiss"),
                attr.attribute("type", "button"),
                event.on_click(DismissError),
              ],
              [html.text("Dismiss")],
            ),
          ]),
        ],
      )
  }
}

// The button that brings the code column back, overlaid on the top-left of the
// right pane. Nothing is rendered while the column is already showing (its own
// header holds the button that hides it).
fn view_reveal_code(model: Model) -> Element(Msg) {
  case model.code_open {
    True -> element.none()
    False ->
      html.button(
        [
          attr.class("icon-btn reveal-code"),
          attr.attribute("title", "Show code"),
          event.on_click(ToggleCode),
        ],
        [html.text("⟩")],
      )
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

pub fn main() -> Nil {
  let app = lustre.application(init, update, view)
  let assert Ok(_) = lustre.start(app, "#app", Nil)
  Nil
}
