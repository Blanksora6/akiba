// Reads an M-Pesa confirmation SMS into transaction fields, so the user can
// paste the message instead of retyping it. Returns null if the text doesn't
// look like an M-Pesa confirmation.
//
// Handles the common Safaricom formats:
//   sent to a person / paybill ("Ksh1,250.00 sent to JOHN DOE 0712345678 on 2/10/26 …")
//   till / buy goods          ("Ksh350.00 paid to NAIVAS SUPERMARKET. on 2/10/26 …")
//   received                  ("You have received Ksh5,000.00 from JANE DOE 0722… on 2/10/26 …")
//   withdrawal                ("Withdraw Ksh2,000.00 from 123456 - AGENT NAME New M-PESA balance …")
//   airtime                   ("You bought Ksh100.00 of airtime on 2/10/26 …")

const AMOUNT = String.raw`Ksh\s?([\d,]+(?:\.\d{1,2})?)`;
const toNumber = (s) => Number(s.replace(/,/g, ''));

// Party names run until the phone number, "for account", " on <date>", or the balance line.
const cleanParty = (s) => s
  .replace(/\s+(?:0|\+?254)\d{9}\b.*$/, '')
  .replace(/\s+for account\b.*$/i, '')
  .replace(/\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}.*$/i, '')
  .replace(/\s*New M-PESA balance.*$/i, '')
  .replace(/[.\s]+$/, '')
  .trim();

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function parseMpesaSms(text) {
  if (typeof text !== 'string' || !/confirmed/i.test(text) || !/ksh/i.test(text)) return null;
  const sms = text.replace(/\s+/g, ' ').trim();

  const code = sms.match(/^([A-Z0-9]{10})\b/)?.[1] ?? null;

  let type, amount, party;
  let m;
  if ((m = sms.match(new RegExp(`received ${AMOUNT} from (.+?)(?: on \\d|$| New M-PESA)`, 'i')))) {
    type = 'income'; amount = m[1]; party = m[2];
  } else if ((m = sms.match(new RegExp(`${AMOUNT} sent to (.+?)(?: on \\d| New M-PESA|$)`, 'i')))) {
    type = 'expense'; amount = m[1]; party = m[2];
  } else if ((m = sms.match(new RegExp(`${AMOUNT} paid to (.+?)(?: on \\d| New M-PESA|$)`, 'i')))) {
    type = 'expense'; amount = m[1]; party = m[2];
  } else if ((m = sms.match(new RegExp(`Withdraw ${AMOUNT} from (.+?)(?: New M-PESA|$)`, 'i')))) {
    type = 'expense'; amount = m[1]; party = `Withdrawal · ${m[2].replace(/^\d+\s*-\s*/, '')}`;
  } else if ((m = sms.match(new RegExp(`bought ${AMOUNT} of airtime`, 'i')))) {
    type = 'expense'; amount = m[1]; party = 'Airtime';
  } else {
    return null;
  }

  // "on 2/10/26" is day/month/year.
  const d = sms.match(/\bon (\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/i);
  const date = d
    ? `${d[3].length === 2 ? `20${d[3]}` : d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`
    : null;

  const cost = sms.match(new RegExp(`Transaction cost,? ${AMOUNT}`, 'i'));
  const fee = cost ? toNumber(cost[1]) : 0;

  const who = titleCase(cleanParty(party));
  const note = ['M-Pesa', who, code].filter(Boolean).join(' · ') + (fee > 0 ? ` (fee KES ${fee})` : '');

  return { type, amount: toNumber(amount), fee, date, note, code, party: who };
}
