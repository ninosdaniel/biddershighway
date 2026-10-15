const labels = {
  sv: {
    no_reserve: "Inget reservationspris",
    reserve_close: "Reservationspris nästan nått",
    reserve_lowered: "Sänkt reservationspris",
    reserve_met: "Reservationspris uppnått!",
  },
  en: {
    no_reserve: "No reserve",
    reserve_close: "Reserve almost met",
    reserve_lowered: "Lowered reserve",
    reserve_met: "Reserve met!",
  },
  de: {
    no_reserve: "Ohne Mindestpreis",
    reserve_close: "Mindestpreis fast erreicht",
    reserve_lowered: "Mindestpreis gesenkt",
    reserve_met: "Mindestpreis erreicht!",
  },
};
export function ReserveBadges({ item, locale }) {
  return (
    <div className="site-reserve-badges">
      {[
        ["no_reserve", "money_off"],
        ["reserve_close", "balance"],
        ["reserve_lowered", "trending_down"],
        ["reserve_met", "paid"],
      ]
        .filter(
          ([key]) => item[key] && !(key === "reserve_met" && item.no_reserve),
        )
        .map(([key, icon]) => (
          <span className={`site-reserve-badge ${key}`} key={key}>
            <span className="icon" aria-hidden="true">
              {icon}
            </span>
            {labels[locale][key]}
          </span>
        ))}
    </div>
  );
}
