//// Animator -- an application for program-generated drawings.

import builtins
import drawing
import editor
import errors
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

const default_code =
  "fn draw(shape_slider: Int) -> List(Path) {\n  [Path(Line(Point(0, 0), Point(100, 100)), 0, 10, 2)]\n}\n"

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
  )
}

pub type Msg {
  SetCode(String)

  // Layout controls
  ToggleCode

  // Clear the canvas error overlay (Esc, dismiss button, or backdrop click).
  DismissError
}

@external(javascript, "./app_ffi.mjs", "listenEscape")
fn listen_escape(on_escape: fn() -> Nil) -> Nil

// ── Init ───────────────────────────────────────────────────────────────────────

pub fn init(_flags: Nil) -> #(Model, Effect(Msg)) {
  #(
    Model(source: "", code_open: True, error: ""),
    // Effects that happen automatically at the start go here.
    effect.batch([
      editor.mount(default_code, SetCode),
      effect.from(fn(dispatch) { dispatch(SetCode(default_code)) }),
      // Esc dismisses the canvas error overlay from anywhere (incl. the editor).
      effect.from(fn(dispatch) { listen_escape(fn() { dispatch(DismissError) }) }),
    ]),
  )
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

// ── Update ─────────────────────────────────────────────────────────────────────

pub fn update(model: Model, msg: Msg) -> #(Model, Effect(Msg)) {
  case msg {
    ToggleCode -> #(Model(..model, code_open: !model.code_open), effect.none())

    DismissError -> #(Model(..model, error: ""), effect.none())

    // After each keystroke in the editor, evaluate user code and animate
    // its paths, or show the canvas error overlay on failure.
    SetCode(text) ->
      case run_source(10, text) {
        Ok(paths) -> {
          let rendered =
            list.map(paths, fn(path) { render.render_path(path, "#ffffff") })
          #(
            Model(..model, error: "", source: text),
            // Replace the drawing and restart the clock so the new paths
            // animate from the beginning at normal speed.
            effect.from(fn(_) {
              render.set_drawing(rendered)
              render.reset_clock()
            }),
          )
        }
        // Keep the previous drawing; do not call set_drawing. Overlay shows
        // the error over the dimmed canvas until the next success or dismiss.
        Error(msg) -> #(
          Model(..model, error: msg, source: text),
          effect.none(),
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
      editor.view_panel(ToggleCode),
    ]),
    view_anim(model),
  ])
}

fn view_anim(model: Model) -> Element(Msg) {
  let area_class = case model.error {
    "" -> "canvas-area"
    _ -> "canvas-area has-error"
  }
  html.div([attr.class(area_class)], [
    view_reveal_code(model),
    html.canvas([attr.id("animation-canvas"), attr.class("canvas")]),
    view_error_overlay(model.error),
  ])
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
