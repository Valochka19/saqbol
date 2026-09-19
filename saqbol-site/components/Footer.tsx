export function Footer() {
  return (
    <footer className="pb-8">
      <div className="rule-double" />
      <div className="fine flex flex-wrap justify-between gap-x-8 gap-y-2 pt-3">
        <span>
          SaqBol — прототип для конкурса Ассоциации банков РК «Твори, дерзай, побеждай», 2026
        </span>
        <span>
          Тексты сообщений не хранятся · номера показаны в замаскированном виде ·{" "}
          <a className="underline underline-offset-2" href="https://t.me/saqbolai_bot" target="_blank" rel="noreferrer">
            @saqbolai_bot
          </a>
        </span>
      </div>
    </footer>
  );
}
