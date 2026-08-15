import { redirect } from "next/navigation";

// 旧URL。単語復習は「演習」ハブ（/practice）に統合したため、そちらへリダイレクトする。
export default function VocabularyLearnPage() {
  redirect("/practice");
}
