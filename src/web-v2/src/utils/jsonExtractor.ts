/**
 * AIのテキスト応答からJSONブロックまたはJSONオブジェクトを抽出する
 */
export const extractJson = (text: string): any => {
  // 1. マークダウンのコードブロック (```json ... ```) を探す
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    return JSON.parse(match[1]);
  }

  // 2. ブロックがない場合、最初の '{' または '[' から、最後の '}' または ']' までを探す
  const firstOpenBrace = text.indexOf('{');
  const firstOpenBracket = text.indexOf('[');

  let start = -1;
  let end = -1;

  // 配列 [...] と オブジェクト {...} 、先に出てきた方採用
  if (firstOpenBracket !== -1 && (firstOpenBrace === -1 || firstOpenBracket < firstOpenBrace)) {
    // 配列
    start = firstOpenBracket;
    end = text.lastIndexOf(']');
  } else if (firstOpenBrace !== -1) {
    // オブジェクト
    start = firstOpenBrace;
    end = text.lastIndexOf('}');
  }

  if (start === -1 || end === -1 || end < start) {
    throw new Error("AIの応答に有効なJSONが含まれていません。");
  }

  const jsonString = text.substring(start, end + 1);
  return JSON.parse(jsonString);
};