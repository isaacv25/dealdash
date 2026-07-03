"use server";

import { revalidatePath } from "next/cache";
import { permanentlyDeleteTrashRecordAction, restoreTrashRecordAction } from "@/app/(app)/actions";
import type { TrashRecordType } from "@/lib/dealdash";

export async function restoreTrashFormAction(formData: FormData) {
  const type = String(formData.get("type") || "") as TrashRecordType;
  const id = String(formData.get("id") || "");
  await restoreTrashRecordAction(type, id);
  revalidatePath("/trash");
}

export async function permanentlyDeleteTrashFormAction(formData: FormData) {
  const type = String(formData.get("type") || "") as TrashRecordType;
  const id = String(formData.get("id") || "");
  await permanentlyDeleteTrashRecordAction(type, id);
  revalidatePath("/trash");
}
