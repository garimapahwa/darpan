interface CaptionsProps {
  userPartial: string;
  aiCaption: string;
  speaking: boolean;
}

export function Captions({ userPartial, aiCaption, speaking }: CaptionsProps) {
  const line = speaking ? aiCaption : userPartial;
  if (!line) return null;
  return (
    <div className="captions">
      <span className={`captions__label ${speaking ? "captions__label--ai" : "captions__label--user"}`}>
        {speaking ? "Darpan" : "You"}
      </span>
      <span className="captions__text">{line}</span>
    </div>
  );
}
