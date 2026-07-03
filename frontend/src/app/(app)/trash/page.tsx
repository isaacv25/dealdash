import { getCurrentUser } from "@/lib/auth";
import { loadTrash } from "@/lib/dealdash/workspace";
import type { TrashRecord, TrashRecordType } from "@/lib/dealdash";
import { permanentlyDeleteTrashFormAction, restoreTrashFormAction } from "./actions";
import { TrashButtons } from "./trash-buttons";

const typeLabels: Record<TrashRecordType, string> = {
  funded: "Funded Progress",
  pipeline: "Pipeline",
  "follow-up": "Follow-Ups",
};

const deletedDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function TrashPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const trash = await loadTrash(user.companyId);
  const grouped = trash.reduce<Record<TrashRecordType, TrashRecord[]>>(
    (acc, record) => {
      acc[record.type].push(record);
      return acc;
    },
    { funded: [], pipeline: [], "follow-up": [] },
  );

  return (
    <section className="glass-card rounded-[1.6rem] p-5 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="pill bg-[var(--accent-soft)] text-[var(--accent-strong)]">Trash</div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Recently deleted</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Deleted records stay recoverable for 30 calendar days before they age out of this view.
          </p>
        </div>
        <div className="rounded-[1rem] border border-[var(--line)] bg-white/78 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Recoverable</p>
          <p className="text-2xl font-semibold">{trash.length}</p>
        </div>
      </div>

      {trash.length === 0 ? (
        <div className="rounded-[1.2rem] border border-dashed border-[var(--line)] bg-white/66 p-8 text-center text-sm text-[var(--muted)]">
          Trash is empty.
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([type, records]) => (
            <div key={type} className={records.length ? "block" : "hidden"}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                {typeLabels[type as TrashRecordType]}
              </h3>
              <div className="grid gap-3">
                {records.map((record) => (
                  <article
                    key={`${record.type}-${record.id}`}
                    className="grid gap-3 rounded-[1.1rem] border border-white/80 bg-white/78 p-4 shadow-[0_8px_26px_rgba(21,42,74,0.06)] md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <div>
                      <p className="font-semibold">{record.label}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">{record.detail}</p>
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Deleted {deletedDateFormatter.format(new Date(record.deletedAt))} - {record.daysRemaining} days remaining
                      </p>
                    </div>
                    <TrashButtons
                      deleteAction={permanentlyDeleteTrashFormAction}
                      record={record}
                      restoreAction={restoreTrashFormAction}
                    />
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
