function RawLine({ line, isFirst }: { line: string; isFirst: boolean }) {
  if (isFirst) {
    const isStatus = line.startsWith("HTTP/");
    return (
      <div
        className={`mono whitespace-pre-wrap break-all leading-5 ${
          isStatus ? "text-[#f48771]" : "text-[#d4d4d4]"
        }`}
      >
        {line || " "}
      </div>
    );
  }
  const colon = line.indexOf(":");
  if (colon > 0 && line[colon + 1] === " ") {
    return (
      <div className="mono whitespace-pre-wrap break-all leading-5">
        <span className="text-[#9cdcfe]">{line.slice(0, colon + 1)}</span>
        <span className="text-[#d4d4d4]">{line.slice(colon + 1)}</span>
      </div>
    );
  }
  return (
    <div className="mono whitespace-pre-wrap break-all leading-5 text-[#d4d4d4]">
      {line || " "}
    </div>
  );
}

export function RawHttpView({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="flex min-h-0 flex-1 overflow-auto bg-[#1e1e1e]">
      <div className="shrink-0 select-none border-r border-[#333] py-2 pr-2 pl-2 text-right text-[11px] leading-5 text-[#666]">
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="min-w-0 flex-1 py-2 pr-3">
        {lines.map((line, i) => (
          <RawLine key={i} line={line} isFirst={i === 0} />
        ))}
      </div>
    </div>
  );
}
