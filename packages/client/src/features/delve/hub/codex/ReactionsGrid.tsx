import { getDelveRegistry } from '../../registry';

/** Every reaction, by name once discovered (`reactionsSeen`), the rest as ???. */
export function ReactionsGrid({ reactionsSeen }: { reactionsSeen: readonly string[] }) {
  const data = getDelveRegistry().getArpgData();
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="delve-display text-xs font-bold uppercase tracking-widest text-fuchsia-300">
          Reactions
        </span>
        <span className="text-[10px] text-stone-500">
          {reactionsSeen.length}/{data.reactions.length} discovered
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {data.reactions.map((r) => {
          const seen = reactionsSeen.includes(r.id);
          return (
            <div
              key={r.id}
              className="delve-panel flex items-center gap-2.5 p-2"
              data-testid={seen ? `reaction-${r.id}` : 'reaction-unknown'}
              style={seen ? { borderColor: 'rgba(232,121,249,0.4)' } : undefined}
            >
              <span className="w-8 text-center text-2xl">{seen ? r.icon : '❔'}</span>
              <span className="min-w-0">
                <span
                  className="delve-display block text-sm font-bold"
                  style={{ color: seen ? '#f0abfc' : '#57534e' }}
                >
                  {seen ? r.name : '???'}
                </span>
                <span className="block text-[10.5px] leading-snug text-stone-400">
                  {seen
                    ? r.text
                    : 'Stack one element on a foe, then hit it with another, to discover.'}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
