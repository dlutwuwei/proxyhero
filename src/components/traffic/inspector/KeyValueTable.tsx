import { useT } from "../../../hooks/useT";

export function KeyValueTable({
  rows,
  emptyText,
}: {
  rows: [string, string][];
  emptyText: string;
}) {
  const t = useT();
  if (rows.length === 0) {
    return <div className="p-4 text-sm text-[#888]">{emptyText}</div>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-[#333] text-[#888]">
          <th className="w-40 px-3 py-1.5 text-left font-medium">
            {t("traffic.inspector.key")}
          </th>
          <th className="px-3 py-1.5 text-left font-medium">
            {t("traffic.inspector.value")}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={`${k}-${i}`} className="border-b border-[#333]/80">
            <td className="mono w-40 shrink-0 px-3 py-1.5 align-top text-[#9cdcfe]">
              {k}
            </td>
            <td className="mono break-all px-3 py-1.5 text-[#d4d4d4]">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
