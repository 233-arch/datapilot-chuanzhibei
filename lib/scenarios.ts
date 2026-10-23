import { parseCSV } from "./data-engine";
export function campusScenario() {
  const lines = ["日期,场所,支付方式,订单编号,消费金额,成本"];
  const venues = ["食堂", "便利店", "文印店"];
  for (let month = 8; month <= 9; month++) {
    for (let day = 1; day <= (month === 8 ? 31 : 30); day++) {
      venues.forEach((venue, index) => {
        const amount =
          (month === 9 && index === 1 ? 50 : 100) +
          ((day * 7 + index * 11) % 30);
        lines.push(
          "2026-" +
            String(month).padStart(2, "0") +
            "-" +
            String(day).padStart(2, "0") +
            "," +
            venue +
            "," +
            (day % 2 ? "校园卡" : "移动支付") +
            ",C" +
            month +
            String(day).padStart(2, "0") +
            index +
            "," +
            amount +
            "," +
            Math.round(amount * 0.65),
        );
      });
    }
  }
  return {
    ...parseCSV(lines.join("\n"), "校园消费 · 合成场景.csv"),
    source: "demo" as const,
  };
}
