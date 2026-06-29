import "server-only";
import { loadSeedDataset } from "@/lib/dealdash/data";

export async function loadInitialSeed() {
  return loadSeedDataset();
}
