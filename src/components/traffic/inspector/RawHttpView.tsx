import { VirtualTextView } from "./VirtualTextView";

function RawLine({ line, isFirst }: { line: string; isFirst: boolean }) {
  if (isFirst) {
    const isStatus = line.startsWith("HTTP/");
    return (
      <div
        className={`mono min-w-0 flex-1 whitespace-pre-wrap break-all leading-5 ${
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
      <div className="mono min-w-0 flex-1 whitespace-pre-wrap break-all leading-5">
        <span className="text-[#9cdcfe]">{line.slice(0, colon + 1)}</span>
        <span className="text-[#d4d4d4]">{line.slice(colon + 1)}</span>
      </div>
    );
  }
  return (
    <div className="mono min-w-0 flex-1 whitespace-pre-wrap break-all leading-5 text-[#d4d4d4]">
      {line || " "}
    </div>
  );
}

export function RawHttpView({ text }: { text: string }) {
  return (
    <VirtualTextView
      text={text}
      gutter
      renderLine={(line, index) => (
        <RawLine line={line} isFirst={index === 0} />
      )}
    />
  );
}
