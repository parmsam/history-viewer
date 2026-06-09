import { useState } from "react";

const COLORS = [
  "#4f8ef7", "#e74c4c", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e67e22", "#3498db", "#e91e63", "#00bcd4",
];

function colorFor(domain: string): string {
  let hash = 0;
  for (const ch of domain) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface Props {
  domain: string;
  browser: string;
}

export function DomainIcon({ domain, browser }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const label = domain.charAt(0).toUpperCase() || "?";
  const bg = colorFor(domain);

  if (domain && !imgFailed) {
    return (
      <img
        className="domain-icon domain-favicon"
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
        alt={domain}
        title={`${domain} (${browser})`}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span className="domain-icon" style={{ background: bg }} title={`${domain} (${browser})`}>
      {label}
    </span>
  );
}
