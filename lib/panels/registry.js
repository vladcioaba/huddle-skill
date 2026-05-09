// registry.js — dispatch question rendering + parsing by panel type.
//
// Panel types:
//   text      (DEFAULT)    free-form markdown answer below question
//   checkbox  (planned)    multi-select list, user uncomments lines
//   radio     (planned)    single-select list, user marks one
//   image_picker (planned) external picker round-trips file path
//   diagram   (planned)    mermaid/asciidoc round-trip
//
// Each panel exports: { render(question), parse(blockText) }.
//   render(question) → string (markdown block for the question section)
//   parse(blockText) → string (normalized answer) or null (no answer detected)
//
// Adding a new panel: drop a file in lib/panels/<type>.js exporting render/parse,
// register it below.

import * as text from "./text.js";

const PANELS = {
  text,
  // checkbox: import("./checkbox.js"),
  // radio: import("./radio.js"),
  // image_picker: import("./image_picker.js"),
  // diagram: import("./diagram.js"),
};

export function getPanel(type = "text") {
  const p = PANELS[type];
  if (!p) {
    throw new Error(
      `unknown panel type "${type}" — supported: ${Object.keys(PANELS).join(", ")}`,
    );
  }
  return p;
}

export function listPanels() {
  return Object.keys(PANELS);
}
