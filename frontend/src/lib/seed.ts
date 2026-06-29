import "server-only";
import { loadSeedDataset } from "@/lib/dealdash";

export async function loadInitialSeed() {
  return loadSeedDataset();
}
