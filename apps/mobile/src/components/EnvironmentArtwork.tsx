import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Pattern, Rect, Stop } from "react-native-svg";
import { useEnvironmentIdentification } from "../state/environmentIdentification";

/** Native navigation bars own their backdrop independently of the title slot. */
export function EnvironmentHeaderBackground() {
  const { artworkStage } = useEnvironmentIdentification();
  return (
    <View style={{ flex: 1 }} pointerEvents="none">
      {artworkStage ? <EnvironmentArtwork stage={artworkStage} /> : null}
    </View>
  );
}

export function renderEnvironmentHeaderBackground() {
  return <EnvironmentHeaderBackground />;
}

/** Static native counterpart of desktop's Nightly sky and Dev blueprint artwork. */
export function EnvironmentArtwork({ stage }: { readonly stage: "Nightly" | "Dev" }) {
  const id = useId();
  const skyId = `${id}-sky`;
  const gridId = `${id}-grid`;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%" viewBox="0 0 280 56" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stage === "Nightly" ? "#30204c" : "#173d66"} />
            <Stop offset="1" stopColor={stage === "Nightly" ? "#121e34" : "#102940"} />
          </LinearGradient>
          <Pattern id={gridId} width="12" height="12" patternUnits="userSpaceOnUse">
            <Path d="M12 0H0V12" fill="none" stroke="#b5dfff" strokeWidth="0.5" opacity="0.18" />
          </Pattern>
        </Defs>
        <Rect width="280" height="56" fill={`url(#${skyId})`} />
        {stage === "Nightly" ? (
          <>
            {[14, 38, 58, 84, 104, 126, 148, 170, 192, 214, 236, 258, 278].map((x, index) => (
              <Circle
                key={x}
                cx={x}
                cy={7 + ((index * 7) % 18)}
                r={index % 2 ? 0.4 : 0.6}
                fill="#e3eaff"
                opacity="0.75"
              />
            ))}
            <Path
              d="M-12 56V48C-12 34 0 23 14 23C18 10 30 1 44 1C58 1 70 9 74 22C79 17 86 14 94 14C110 14 123 26 124 42C132 43 138 48 141 56Z"
              fill="#7386ad"
              opacity="0.12"
            />
            <Path
              d="M150 56C151 44 161 35 173 35C176 24 186 17 198 17C210 17 220 24 223 35C231 35 238 40 241 47C250 47 257 51 260 56Z"
              fill="#7386ad"
              opacity="0.15"
            />
          </>
        ) : (
          <>
            <Rect width="280" height="56" fill={`url(#${gridId})`} />
            <Path
              d="M8 14V6H20M260 6H272V18M8 42V50H20M260 50H272V38M238 12V44M234 16L238 12L242 16M234 40L238 44L242 40"
              stroke="#b5dfff"
              strokeWidth="0.8"
              fill="none"
              opacity="0.5"
            />
            <Circle
              cx="254"
              cy="28"
              r="8"
              stroke="#b5dfff"
              strokeWidth="0.6"
              fill="none"
              opacity="0.35"
            />
          </>
        )}
      </Svg>
    </View>
  );
}
