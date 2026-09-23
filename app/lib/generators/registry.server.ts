import type { GeneratorServerModule } from "./server-types";
import type { GeneratorConfigBase, GeneratorKind } from "./types";
import { songGenerator } from "./song/index.server";
import { monogramGenerator } from "./monogram/index.server";
import { starmapGenerator } from "./starmap/index.server";
import { citymapGenerator } from "./citymap/index.server";
import { birthflowerGenerator } from "./birthflower/index.server";

const MODULES: Record<GeneratorKind, GeneratorServerModule<GeneratorConfigBase>> = {
  song: songGenerator as unknown as GeneratorServerModule<GeneratorConfigBase>,
  monogram: monogramGenerator as unknown as GeneratorServerModule<GeneratorConfigBase>,
  starmap: starmapGenerator as unknown as GeneratorServerModule<GeneratorConfigBase>,
  citymap: citymapGenerator as unknown as GeneratorServerModule<GeneratorConfigBase>,
  birthflower: birthflowerGenerator as unknown as GeneratorServerModule<GeneratorConfigBase>,
};

export function getGeneratorModule(kind: GeneratorKind): GeneratorServerModule<GeneratorConfigBase> {
  return MODULES[kind];
}
