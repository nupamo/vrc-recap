import type { Metadata } from "next";
import MemoryWalk from "./MemoryWalk";

export const metadata: Metadata = {
  title: "VRChat Recap — 당신의 추억이 게임이 됩니다",
  description: "스크린샷을 업로드하지 않고, 브라우저 안에서 통계 recap과 아홉 스테이지의 추억 게임을 만듭니다.",
};

export default function Home() {
  return <MemoryWalk />;
}
