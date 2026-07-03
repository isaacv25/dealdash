"use client";

import type { TrashRecord } from "@/lib/dealdash";

export function TrashButtons({
  record,
  restoreAction,
  deleteAction,
}: {
  record: TrashRecord;
  restoreAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <form action={restoreAction}>
        <input name="type" type="hidden" value={record.type} />
        <input name="id" type="hidden" value={record.id} />
        <button className="ghost-button text-sm" type="submit">
          Restore
        </button>
      </form>
      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (!window.confirm(`Permanently delete ${record.label}? This cannot be undone.`)) {
            event.preventDefault();
          }
        }}
      >
        <input name="type" type="hidden" value={record.type} />
        <input name="id" type="hidden" value={record.id} />
        <button className="delete-button text-sm" type="submit">
          Delete Forever
        </button>
      </form>
    </div>
  );
}
