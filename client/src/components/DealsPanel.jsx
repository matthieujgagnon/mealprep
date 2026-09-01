import { useEffect, useState } from "react";
import { api } from "../api.js";

export function DealsPanel() {
  const [deals, setDeals] = useState(null);

  useEffect(() => {
    api.getDeals().then(setDeals).catch(() => setDeals(null));
  }, []);

  if (!deals) return null;

  return (
    <section className="deals-section">
      <h2 className="deals-heading">This week's specials</h2>
      <p className="deals-sub">
        {deals.stores.join(" · ")}
        {deals.isMockData && " — sample data, live flyer sourcing coming next"}
      </p>
      <div className="deals-row">
        {deals.deals.map((d) => (
          <div key={d.id} className={`price-tag${d.category === "protein" ? " sale" : ""}`}>
            <span className="item">{d.item}</span>
            <span className="price">{d.price}</span>
            <span className="store">{d.store}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
