import { UserRound, History } from 'lucide-react';
import { date } from '../utilities/format';
import './record-activity.css';
type Stamp = { userName: string; at: string };
export type Activity = { created: Stamp | null; updated: Stamp | null };
export function RecordActivity({ value }: { value?: unknown }) {
  if (value === undefined) return null;
  const activity = value as Activity | null;
  return (
    <footer className="record-activity no-print" aria-label="Autoria do registro">
      {activity?.created && (
        <span>
          <UserRound size={13} />
          <span>
            Registrado por <strong>{activity.created.userName}</strong>
            <time dateTime={activity.created.at}>{date(activity.created.at)}</time>
          </span>
        </span>
      )}
      {activity?.updated && (
        <span>
          <History size={13} />
          <span>
            Última alteração por <strong>{activity.updated.userName}</strong>
            <time dateTime={activity.updated.at}>{date(activity.updated.at)}</time>
          </span>
        </span>
      )}
      {!activity?.created && !activity?.updated && (
        <span>Autoria não registrada no histórico.</span>
      )}
    </footer>
  );
}
