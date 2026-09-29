const ANGLE_ADDRESS = /<([^>]+)>/;
const DOMAIN_PREFIX = '@';

/** 'HDFC Bank <Alerts@HDFCBank.net>' → 'alerts@hdfcbank.net' */
export const extractAddress = (fromHeader: string): string => {
  const match = ANGLE_ADDRESS.exec(fromHeader);
  const address = match ? (match.at(1) ?? fromHeader) : fromHeader;
  return address.trim().toLowerCase();
};

/** A sender entry is an exact address or '@domain', which matches that domain and its subdomains. */
export const matchesSender = (address: string, senders: readonly string[]): boolean => {
  const normalised = address.trim().toLowerCase();
  return senders.some((sender) => {
    const entry = sender.toLowerCase();
    if (!entry.startsWith(DOMAIN_PREFIX)) return normalised === entry;
    return normalised.endsWith(entry) || normalised.endsWith(`.${entry.slice(1)}`);
  });
};
