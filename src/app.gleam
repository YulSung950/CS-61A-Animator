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

// ── Model ──────────────────────────────────────────────────────────────────────

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
}

@external(javascript, "./app_ffi.mjs", "listenEscape")
fn listen_escape(on_escape: fn() -> Nil) -> Nil

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
    )
  // Mount + open the restored drawing. On parse/eval failure: show code +
  // overlay and clear the canvas (no stale paths).
  #(
    model,
    effect.batch([
      editor.mount(source, SetCode),
      effect.from(fn(dispatch) { dispatch(OpenDrawing(source)) }),
      listen_esc(),
    ]),
  )
}

fn listen_esc() -> Effect(Msg) {
  effect.from(fn(dispatch) { listen_escape(fn() { dispatch(DismissError) }) })
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
      effect.from(fn(_) { render.set_speed(rate) }),
    )

    SelectDrawing("") -> handle_create_new(model)

    SelectDrawing(name) -> switch_to_drawing(model, name)
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
      view_error_overlay(model.error),
    ]),
    view_control_strip(model),
  ])
}

/// Under-canvas strip: Shape → draw(shape_slider); Speed → set_speed(rate).
fn view_control_strip(model: Model) -> Element(Msg) {
  html.div([attr.class("control-strip")], [
    view_shape_row(model.shape_slider),
    view_speed_row(model.speed),
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
          case float.parse(raw) {
            Ok(rate) -> SetSpeed(rate)
            Error(_) -> SetSpeed(speed)
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

fn format_speed(rate: Float) -> String {
  float.to_string(rate) <> "×"
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
