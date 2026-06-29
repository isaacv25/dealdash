import "server-only";
import { loadSeedDataset } from "@dealdash/backend/server";

export async function loadInitialSeed() {
  return loadSeedDataset();
}
