import "server-only";
import { loadSeedDataset } from "../../../backend/src/data";

export async function loadInitialSeed() {
  return loadSeedDataset();
}
