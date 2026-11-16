/** Před → po jedné komponenty (JSON vedle sebe) — publikace i historie. */
export function ChangeDiff({ before, after }: { before: unknown; after: unknown }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <DiffSide title="Před" value={before} empty="(nová)" />
      <DiffSide title="Po" value={after} empty="(smazaná)" />
    </div>
  );
}

function DiffSide({ title, value, empty }: { title: string; value: unknown; empty: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
        {value == null ? empty : stringify(value)}
      </pre>
    </div>
  );
}

/** Kód skriptů/pluginů je čitelnější jako text než jako jeden JSON řetězec s \n. */
function stringify(value: unknown) {
  if (value && typeof value === "object" && "code" in value) {
    const { code, ...rest } = value as { code: unknown };
    return `${JSON.stringify(rest, null, 2)}\n\n${String(code)}`;
  }
  return JSON.stringify(value, null, 2);
}
