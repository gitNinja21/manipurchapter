/** Incidents survive later time corrections; retries cannot deduct twice for a shift. */
export function missedClockOutEntries(audits: {recordId:string;userId:string;workDate:string}[]) {
  return [...new Map(audits.map(a=>[`${a.userId}:${a.workDate}`,a])).values()].map(a=>({
    id:`missed-out:${a.userId}:${a.workDate}`,userId:a.userId,date:a.workDate,
    kind:"Missed clock-out · automatic 10:45 pm",points:-0.5,
  }));
}
