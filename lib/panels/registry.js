// registry.js — dispatch question rendering + parsing by panel type.
//
// Panel types:
//   text          (DEFAULT)   free-form markdown answer below question
//   checkbox                  multi-select fixed options ([ ] / [x])
//   radio                     single-select fixed options (( ) / (x))
//   image_picker              file path(s) — drag from Finder/Explorer
//   diagram                   mermaid (or any) code-fenced round-trip
//
// Each panel exports: { render(question, opts), parse(blockText, opts) }.
//   render(question, opts) → string (markdown block for the question section)
//   parse(blockText, opts) → string (normalized answer) or null (no answer)
//
// Adding a new panel: drop a file in lib/panels/<type>.js exporting render/parse,
// register it below.

import * as text from "./text.js";
import * as checkbox from "./checkbox.js";
import * as radio from "./radio.js";
import * as imagePicker from "./image_picker.js";
import * as diagram from "./diagram.js";

const PANELS = {
  text,
  checkbox,
  radio,
  image_picker: imagePicker,
  diagram,
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
