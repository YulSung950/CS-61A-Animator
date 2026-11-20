//# sourceMappingURL=app.mjs.map
import * as $float from "../gleam_stdlib/gleam/float.mjs";
import * as $int from "../gleam_stdlib/gleam/int.mjs";
import * as $list from "../gleam_stdlib/gleam/list.mjs";
import * as $result from "../gleam_stdlib/gleam/result.mjs";
import * as $lustre from "../lustre/lustre.mjs";
import * as $attr from "../lustre/lustre/attribute.mjs";
import * as $effect from "../lustre/lustre/effect.mjs";
import * as $element from "../lustre/lustre/element.mjs";
import * as $html from "../lustre/lustre/element/html.mjs";
import * as $event from "../lustre/lustre/event.mjs";
import { listenEscape as listen_escape } from "./app_ffi.mjs";
import * as $builtins from "./builtins.mjs";
import * as $data from "./data.mjs";
import { Library } from "./data.mjs";
import * as $drawing from "./drawing.mjs";
import * as $editor from "./editor.mjs";
import * as $errors from "./errors.mjs";
import {
  Ok,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  CustomType as $CustomType,
  makeError,
} from "./gleam.mjs";
import * as $parser from "./parser.mjs";
import * as $render from "./render.mjs";
import * as $shape from "./shape.mjs";

const FILEPATH = "src/app.gleam";

export class Model extends $CustomType {
  constructor(source, code_open, error, shape_slider, speed, library) {
    super();
    this.source = source;
    this.code_open = code_open;
    this.error = error;
    this.shape_slider = shape_slider;
    this.speed = speed;
    this.library = library;
  }
}
export const Model$Model = (source, code_open, error, shape_slider, speed, library) =>
  new Model(source, code_open, error, shape_slider, speed, library);
export const Model$isModel = (value) => value instanceof Model;
export const Model$Model$source = (value) => value.source;
export const Model$Model$0 = (value) => value.source;
export const Model$Model$code_open = (value) => value.code_open;
export const Model$Model$1 = (value) => value.code_open;
export const Model$Model$error = (value) => value.error;
export const Model$Model$2 = (value) => value.error;
export const Model$Model$shape_slider = (value) => value.shape_slider;
export const Model$Model$3 = (value) => value.shape_slider;
export const Model$Model$speed = (value) => value.speed;
export const Model$Model$4 = (value) => value.speed;
export const Model$Model$library = (value) => value.library;
export const Model$Model$5 = (value) => value.library;

/**
 * Editor keystroke / remount callback. On failure, keep the prior drawing.
 */
export class SetCode extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$SetCode = ($0) => new SetCode($0);
export const Msg$isSetCode = (value) => value instanceof SetCode;
export const Msg$SetCode$0 = (value) => value[0];

/**
 * Load a named library entry into the editor. On failure, clear the canvas.
 */
export class OpenDrawing extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$OpenDrawing = ($0) => new OpenDrawing($0);
export const Msg$isOpenDrawing = (value) => value instanceof OpenDrawing;
export const Msg$OpenDrawing$0 = (value) => value[0];

export class ToggleCode extends $CustomType {}
export const Msg$ToggleCode$const = new ToggleCode();
export const Msg$ToggleCode = () => Msg$ToggleCode$const;
export const Msg$isToggleCode = (value) => value instanceof ToggleCode;

export class DismissError extends $CustomType {}
export const Msg$DismissError$const = new DismissError();
export const Msg$DismissError = () => Msg$DismissError$const;
export const Msg$isDismissError = (value) => value instanceof DismissError;

export class SetShapeSlider extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$SetShapeSlider = ($0) => new SetShapeSlider($0);
export const Msg$isSetShapeSlider = (value) => value instanceof SetShapeSlider;
export const Msg$SetShapeSlider$0 = (value) => value[0];

export class SetSpeed extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$SetSpeed = ($0) => new SetSpeed($0);
export const Msg$isSetSpeed = (value) => value instanceof SetSpeed;
export const Msg$SetSpeed$0 = (value) => value[0];

export class SelectDrawing extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$SelectDrawing = ($0) => new SelectDrawing($0);
export const Msg$isSelectDrawing = (value) => value instanceof SelectDrawing;
export const Msg$SelectDrawing$0 = (value) => value[0];

/**
 * Default playback rate: 1.0× forward (matches canvas.mjs startup).
 * 
 * @ignore
 */
const default_speed = 1.0;

/**
 * Default shape-slider position (reference range [0, 100]).
 * 
 * @ignore
 */
const default_shape_slider = 10;

/**
 * Autosave debounce for editor edits (must stay within 3s).
 * 
 * @ignore
 */
const autosave_ms = 800;

/**
 * Speed track spans this many× normal on each side of pause (0).
 * 
 * @ignore
 */
const speed_max = 2.0;

/**
 * Your app's public address, once you've deployed it in Problem 13, such as
 * "https://your-username.github.io/animator/".
 */
export const public_url = "";

/**
 * Set to True if you would like your app's URL included in the course gallery.
 */
export const include_app_in_gallery = false;

/**
 * A link to your video from Problem 14, which anyone with the link can watch.
 */
export const video_url = "";

/**
 * Set to True if you would like your video included in the course gallery.
 */
export const include_video_in_gallery = false;

function listen_esc() {
  return $effect.from(
    (dispatch) => {
      return listen_escape(() => { return dispatch(Msg$DismissError$const); });
    },
  );
}

export function init(_) {
  let library = $data.load();
  let _block;
  let $ = $data.find_source(library.drawings, library.current);
  if ($ instanceof Ok) {
    let src = $[0];
    _block = src;
  } else {
    _block = $data.new_drawing_stub;
  }
  let source = _block;
  let model = new Model(
    source,
    true,
    "",
    default_shape_slider,
    default_speed,
    library,
  );
  return [
    model,
    $effect.batch(
      listPrepend(
        $editor.mount(source, (var0) => { return new SetCode(var0); }),
        listPrepend(
          $effect.from(
            (dispatch) => { return dispatch(new OpenDrawing(source)); },
          ),
          listPrepend(listen_esc(), $List$Empty$const),
        ),
      ),
    ),
  ];
}

function run_source(shape_slider, source) {
  let $ = $parser.parse_program(source, $builtins.global_frame());
  if ($ instanceof Ok) {
    let program = $[0];
    let _pipe = $drawing.try_draw(shape_slider, program);
    return $result.map_error(_pipe, $errors.error_message);
  } else {
    return $;
  }
}

function paint_paths(paths, reset) {
  let rendered = $list.map(
    paths,
    (path) => { return $render.render_path(path, "#ffffff"); },
  );
  return $effect.from(
    (_) => {
      $render.set_drawing(rendered);
      if (reset) {
        return $render.reset_clock();
      } else {
        return undefined;
      }
    },
  );
}

/**
 * Empty the canvas (used when opening a bad drawing).
 * 
 * @ignore
 */
function clear_canvas() {
  return $effect.from(
    (_) => {
      $render.set_drawing($List$Empty$const);
      return $render.reset_clock();
    },
  );
}

function with_library_source(model, source) {
  let drawings = $data.upsert(
    model.library.drawings,
    model.library.current,
    source,
  );
  let library = new Library(drawings, model.library.current);
  return new Model(
    source,
    model.code_open,
    model.error,
    model.shape_slider,
    model.speed,
    library,
  );
}

function persist_soon(library) {
  return $effect.from((_) => { return $data.save_soon(library, autosave_ms); });
}

function persist_now(library) {
  return $effect.from((_) => { return $data.save_now(library); });
}

function switch_to_drawing(model, name) {
  let drawings = $data.upsert(
    model.library.drawings,
    model.library.current,
    model.source,
  );
  let $ = $data.find_source(drawings, name);
  if ($ instanceof Ok) {
    let source = $[0];
    let library = new Library(drawings, name);
    let model$1 = new Model(
      source,
      model.code_open,
      model.error,
      model.shape_slider,
      model.speed,
      library,
    );
    return [
      model$1,
      $effect.batch(
        listPrepend(
          persist_now(library),
          listPrepend(
            $editor.mount(source, (var0) => { return new SetCode(var0); }),
            listPrepend(
              $effect.from(
                (dispatch) => { return dispatch(new OpenDrawing(source)); },
              ),
              $List$Empty$const,
            ),
          ),
        ),
      ),
    ];
  } else {
    return [model, $effect.none()];
  }
}

function handle_create_new(model) {
  let $ = $data.prompt_drawing_name();
  if ($ === "") {
    return [
      model,
      $effect.from(
        (_) => {
          return $data.set_select_value("drawing-select", model.library.current);
        },
      ),
    ];
  } else {
    let name = $;
    let $1 = $data.find_source(model.library.drawings, name);
    if ($1 instanceof Ok) {
      return switch_to_drawing(model, name);
    } else {
      let drawings = $data.upsert(
        model.library.drawings,
        name,
        $data.new_drawing_stub,
      );
      let library = new Library(drawings, name);
      let source = $data.new_drawing_stub;
      let model$1 = new Model(
        source,
        model.code_open,
        "",
        model.shape_slider,
        model.speed,
        library,
      );
      return [
        model$1,
        $effect.batch(
          listPrepend(
            persist_now(library),
            listPrepend(
              $editor.mount(source, (var0) => { return new SetCode(var0); }),
              listPrepend(
                $effect.from(
                  (dispatch) => { return dispatch(new OpenDrawing(source)); },
                ),
                $List$Empty$const,
              ),
            ),
          ),
        ),
      ];
    }
  }
}

export function update(model, msg) {
  if (msg instanceof SetCode) {
    let text = msg[0];
    let model$1 = with_library_source(model, text);
    let save = persist_soon(model$1.library);
    let $ = run_source(model$1.shape_slider, text);
    if ($ instanceof Ok) {
      let paths = $[0];
      return [
        new Model(
          model$1.source,
          model$1.code_open,
          "",
          model$1.shape_slider,
          model$1.speed,
          model$1.library,
        ),
        $effect.batch(
          listPrepend(
            save,
            listPrepend(paint_paths(paths, true), $List$Empty$const),
          ),
        ),
      ];
    } else {
      let msg$1 = $[0];
      return [
        new Model(
          model$1.source,
          model$1.code_open,
          msg$1,
          model$1.shape_slider,
          model$1.speed,
          model$1.library,
        ),
        save,
      ];
    }
  } else if (msg instanceof OpenDrawing) {
    let text = msg[0];
    let model$1 = with_library_source(model, text);
    let save = persist_now(model$1.library);
    let $ = run_source(model$1.shape_slider, text);
    if ($ instanceof Ok) {
      let paths = $[0];
      return [
        new Model(
          model$1.source,
          model$1.code_open,
          "",
          model$1.shape_slider,
          model$1.speed,
          model$1.library,
        ),
        $effect.batch(
          listPrepend(
            save,
            listPrepend(paint_paths(paths, true), $List$Empty$const),
          ),
        ),
      ];
    } else {
      let msg$1 = $[0];
      return [
        new Model(
          model$1.source,
          model$1.code_open,
          msg$1,
          model$1.shape_slider,
          model$1.speed,
          model$1.library,
        ),
        $effect.batch(
          listPrepend(save, listPrepend(clear_canvas(), $List$Empty$const)),
        ),
      ];
    }
  } else if (msg instanceof ToggleCode) {
    return [
      new Model(
        model.source,
        !model.code_open,
        model.error,
        model.shape_slider,
        model.speed,
        model.library,
      ),
      $effect.none(),
    ];
  } else if (msg instanceof DismissError) {
    return [
      new Model(
        model.source,
        model.code_open,
        "",
        model.shape_slider,
        model.speed,
        model.library,
      ),
      $effect.none(),
    ];
  } else if (msg instanceof SetShapeSlider) {
    let value = msg[0];
    let $ = run_source(value, model.source);
    if ($ instanceof Ok) {
      let paths = $[0];
      return [
        new Model(
          model.source,
          model.code_open,
          "",
          value,
          model.speed,
          model.library,
        ),
        paint_paths(paths, false),
      ];
    } else {
      let msg$1 = $[0];
      return [
        new Model(
          model.source,
          model.code_open,
          msg$1,
          value,
          model.speed,
          model.library,
        ),
        $effect.none(),
      ];
    }
  } else if (msg instanceof SetSpeed) {
    let rate = msg[0];
    return [
      new Model(
        model.source,
        model.code_open,
        model.error,
        model.shape_slider,
        rate,
        model.library,
      ),
      $effect.from((_) => { return $render.set_speed(rate); }),
    ];
  } else {
    let $ = msg[0];
    if ($ === "") {
      return handle_create_new(model);
    } else {
      let name = $;
      return switch_to_drawing(model, name);
    }
  }
}

function format_speed(rate) {
  return $float.to_string(rate) + "×";
}

function view_speed_row(speed) {
  return $html.div(
    listPrepend(
      $attr.class$("control-row control-row-speed"),
      $List$Empty$const,
    ),
    listPrepend(
      $html.label(
        listPrepend(
          $attr.class$("control-label"),
          listPrepend($attr.for$("speed-slider"), $List$Empty$const),
        ),
        listPrepend($html.text("Speed"), $List$Empty$const),
      ),
      listPrepend(
        $html.div(
          listPrepend($attr.class$("speed-track-wrap"), $List$Empty$const),
          listPrepend(
            $html.input(
              listPrepend(
                $attr.type_("range"),
                listPrepend(
                  $attr.id("speed-slider"),
                  listPrepend(
                    $attr.attribute("data-test-id", "speed-slider"),
                    listPrepend(
                      $attr.class$("control-slider speed-slider"),
                      listPrepend(
                        $attr.min($float.to_string(0.0 - speed_max)),
                        listPrepend(
                          $attr.max($float.to_string(speed_max)),
                          listPrepend(
                            $attr.step("0.1"),
                            listPrepend(
                              $attr.value($float.to_string(speed)),
                              listPrepend(
                                $event.on_input(
                                  (raw) => {
                                    let $ = $float.parse(raw);
                                    if ($ instanceof Ok) {
                                      let rate = $[0];
                                      return new SetSpeed(rate);
                                    } else {
                                      return new SetSpeed(speed);
                                    }
                                  },
                                ),
                                $List$Empty$const,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            listPrepend(
              $html.div(
                listPrepend($attr.class$("speed-legend"), $List$Empty$const),
                listPrepend($html.text("◀ reverse · ▶ fwd"), $List$Empty$const),
              ),
              $List$Empty$const,
            ),
          ),
        ),
        listPrepend(
          $html.span(
            listPrepend($attr.class$("control-value"), $List$Empty$const),
            listPrepend($html.text(format_speed(speed)), $List$Empty$const),
          ),
          $List$Empty$const,
        ),
      ),
    ),
  );
}

function view_shape_row(shape_slider) {
  return $html.div(
    listPrepend($attr.class$("control-row"), $List$Empty$const),
    listPrepend(
      $html.label(
        listPrepend(
          $attr.class$("control-label"),
          listPrepend($attr.for$("shape-slider"), $List$Empty$const),
        ),
        listPrepend($html.text("Shape"), $List$Empty$const),
      ),
      listPrepend(
        $html.input(
          listPrepend(
            $attr.type_("range"),
            listPrepend(
              $attr.id("shape-slider"),
              listPrepend(
                $attr.attribute("data-test-id", "shape-slider"),
                listPrepend(
                  $attr.class$("control-slider"),
                  listPrepend(
                    $attr.min("0"),
                    listPrepend(
                      $attr.max("100"),
                      listPrepend(
                        $attr.step("1"),
                        listPrepend(
                          $attr.value($int.to_string(shape_slider)),
                          listPrepend(
                            $event.on_input(
                              (raw) => {
                                let $ = $int.parse(raw);
                                if ($ instanceof Ok) {
                                  let n = $[0];
                                  return new SetShapeSlider(n);
                                } else {
                                  return new SetShapeSlider(shape_slider);
                                }
                              },
                            ),
                            $List$Empty$const,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        listPrepend(
          $html.span(
            listPrepend($attr.class$("control-value"), $List$Empty$const),
            listPrepend(
              $html.text($int.to_string(shape_slider)),
              $List$Empty$const,
            ),
          ),
          $List$Empty$const,
        ),
      ),
    ),
  );
}

/**
 * Under-canvas strip: Shape → draw(shape_slider); Speed → set_speed(rate).
 * 
 * @ignore
 */
function view_control_strip(model) {
  return $html.div(
    listPrepend($attr.class$("control-strip"), $List$Empty$const),
    listPrepend(
      view_shape_row(model.shape_slider),
      listPrepend(view_speed_row(model.speed), $List$Empty$const),
    ),
  );
}

/**
 * Semi-transparent toast centered over the canvas. Backdrop click or the
 * Dismiss button clears it; Esc is handled globally in init.
 * 
 * @ignore
 */
function view_error_overlay(error) {
  if (error === "") {
    return $element.none();
  } else {
    let msg = error;
    return $html.div(
      listPrepend(
        $attr.class$("error-overlay"),
        listPrepend($attr.attribute("role", "alert"), $List$Empty$const),
      ),
      listPrepend(
        $html.div(
          listPrepend(
            $attr.class$("error-overlay-backdrop"),
            listPrepend(
              $event.on_click(Msg$DismissError$const),
              $List$Empty$const,
            ),
          ),
          $List$Empty$const,
        ),
        listPrepend(
          $html.div(
            listPrepend($attr.class$("error-toast"), $List$Empty$const),
            listPrepend(
              $html.div(
                listPrepend(
                  $attr.class$("error-toast-title"),
                  $List$Empty$const,
                ),
                listPrepend($html.text("Couldn't draw"), $List$Empty$const),
              ),
              listPrepend(
                $html.pre(
                  listPrepend(
                    $attr.class$("error-toast-msg"),
                    $List$Empty$const,
                  ),
                  listPrepend($html.text(msg), $List$Empty$const),
                ),
                listPrepend(
                  $html.button(
                    listPrepend(
                      $attr.class$("error-toast-dismiss"),
                      listPrepend(
                        $attr.attribute("type", "button"),
                        listPrepend(
                          $event.on_click(Msg$DismissError$const),
                          $List$Empty$const,
                        ),
                      ),
                    ),
                    listPrepend($html.text("Dismiss"), $List$Empty$const),
                  ),
                  $List$Empty$const,
                ),
              ),
            ),
          ),
          $List$Empty$const,
        ),
      ),
    );
  }
}

function view_reveal_code(model) {
  let $ = model.code_open;
  if ($) {
    return $element.none();
  } else {
    return $html.button(
      listPrepend(
        $attr.class$("icon-btn reveal-code"),
        listPrepend(
          $attr.attribute("title", "Show code"),
          listPrepend($event.on_click(Msg$ToggleCode$const), $List$Empty$const),
        ),
      ),
      listPrepend($html.text("⟩"), $List$Empty$const),
    );
  }
}

function view_anim(model) {
  let _block;
  let $ = model.error;
  if ($ === "") {
    _block = "canvas-area";
  } else {
    _block = "canvas-area has-error";
  }
  let area_class = _block;
  return $html.div(
    listPrepend($attr.class$(area_class), $List$Empty$const),
    listPrepend(
      view_reveal_code(model),
      listPrepend(
        $html.div(
          listPrepend($attr.class$("canvas-stage"), $List$Empty$const),
          listPrepend(
            $html.canvas(
              listPrepend(
                $attr.id("animation-canvas"),
                listPrepend($attr.class$("canvas"), $List$Empty$const),
              ),
            ),
            listPrepend(view_error_overlay(model.error), $List$Empty$const),
          ),
        ),
        listPrepend(view_control_strip(model), $List$Empty$const),
      ),
    ),
  );
}

export function view(model) {
  let _block;
  let $ = model.code_open;
  if ($) {
    _block = "app";
  } else {
    _block = "app code-hidden";
  }
  let app_class = _block;
  return $html.div(
    listPrepend($attr.class$(app_class), $List$Empty$const),
    listPrepend(
      $html.div(
        listPrepend($attr.class$("code-col"), $List$Empty$const),
        listPrepend(
          $editor.view_panel(
            Msg$ToggleCode$const,
            model.library.drawings,
            model.library.current,
            (var0) => { return new SelectDrawing(var0); },
          ),
          $List$Empty$const,
        ),
      ),
      listPrepend(view_anim(model), $List$Empty$const),
    ),
  );
}

export function main() {
  let app = $lustre.application(init, update, view);
  let $ = $lustre.start(app, "#app", undefined);
  if (!($ instanceof Ok)) {
    throw makeError(
      "let_assert",
      FILEPATH,
      "app",
      471,
      "main",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 15204,
        end: 15253,
        pattern_start: 15215,
        pattern_end: 15220
      }
    )
  }
  return undefined;
}
