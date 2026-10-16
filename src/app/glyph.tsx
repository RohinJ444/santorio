/** App icon art: a small hologram figure on its ring, drawn for next/og ImageResponse. */
export function Glyph({ size }: { size: number }) {
  const u = size / 100;
  const cyan = "#3fe0ff";
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background: "radial-gradient(circle at 50% 42%, #10304c 0%, #071223 55%, #03060c 100%)",
      }}
    >
      {/* head */}
      <div
        style={{
          position: "absolute",
          top: 16 * u,
          width: 15 * u,
          height: 17 * u,
          borderRadius: 999,
          border: `${2.2 * u}px solid ${cyan}`,
          boxShadow: `0 0 ${6 * u}px ${cyan}`,
        }}
      />
      {/* torso */}
      <div
        style={{
          position: "absolute",
          top: 35 * u,
          width: 26 * u,
          height: 36 * u,
          borderRadius: `${11 * u}px ${11 * u}px ${7 * u}px ${7 * u}px`,
          border: `${2.2 * u}px solid ${cyan}`,
          boxShadow: `0 0 ${6 * u}px ${cyan}`,
        }}
      />
      {/* gut */}
      <div
        style={{
          position: "absolute",
          top: 50 * u,
          width: 9 * u,
          height: 9 * u,
          borderRadius: 999,
          background: "#9dff6a",
          boxShadow: `0 0 ${8 * u}px #9dff6a`,
        }}
      />
      {/* ring */}
      <div
        style={{
          position: "absolute",
          top: 74 * u,
          width: 52 * u,
          height: 12 * u,
          borderRadius: 999,
          border: `${1.6 * u}px solid ${cyan}`,
          opacity: 0.8,
        }}
      />
    </div>
  );
}
