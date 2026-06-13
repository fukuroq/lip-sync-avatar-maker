# 口パクアバターメーカー（Lip-Sync Avatar Maker）

ブラウザ上で動作する、マイク入力で口パクできるアバター作成アプリです。顔の画像をアップロードして、声を出すと口がリアルタイムに動きます。

## デモ

**[ライブデモ](https://lip-sync-avatar-maker.fukurou-bbb-23.workers.dev)**（Cloudflare Pages）

## 機能

- **🎤 リアルタイム口パク**
  - マイク入力に応じて、画像の口がリアルタイムに動きます
  - Web Audio APIで音声を解析し、口の開き具合を調整

- **🤖 AI顔認識**
  - MediaPipe Face Meshで顔を自動検出
  - 口の位置を自動で認識し、調整モードへ移行
  - 顔が認識できない場合は中央にデフォルト配置

- **🎨 視覚的調整**
  - ドラッグで口の位置を移動
  - ハンドルでサイズ調整（角・辺の両方対応）
  - 画像の回転（±45°）
  - 画像の拡大縮小（50%〜200%）
  - 画像のパン（移動）

- **🟩 グリーンバック**
  - 背景をクロマキーグリーン（#00b140）に切り替え
  - クロマキー合成に対応

- **🖼️ 背景除去（オプション）**
  - `@imgly/background-removal`でブラウザ内でAI背景除去
  - ONNX Runtime Webを使用し、サーバー不要
  - 初回のみ40MBモデルダウンロード（2回目以降はキャッシュ）
  - 処理サイズの自動フォールバック（1024px→768px→512px）

- **☁️ ゼロサーバーコスト**
  - Cloudflare Pagesで静的ホスティング
  - すべての処理がブラウザ内で完結

## 技術スタック

- **フレームワーク**: Vite + Vanilla TypeScript
- **UI**: 純粋なHTML/CSS（Canvas API）
- **顔認識**: MediaPipe Face Mesh（Google）
- **背景除去**: @imgly/background-removal + ONNX Runtime Web
- **音声解析**: Web Audio API
- **デプロイ**: Cloudflare Pages（静的サイト）

## 使い方

1. 顔が写っている画像をアップロード
2. AIが自動で口の位置を検出
3. 必要に応じてドラッグ・リサイズで微調整
4. 「🎬 口パク開始」ボタンをクリック
5. 「🎤 マイクをONにする」ボタンをクリックして許可
6. 声を出すと、画像の口が人形劇風に動きます!

## 開発環境構築

```bash
# リポジトリをクローン
git clone https://github.com/yourusername/lip-sync-avatar-maker.git
cd lip-sync-avatar-maker

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev

# ビルド
npm run build

# プレビュー
npm run preview
```

## デプロイ

### Cloudflare Pages

```bash
# ビルド
npm run build

# dist/フォルダをデプロイ
# Cloudflare Pagesダッシュボードでdistフォルダをアップロード
```

## 注意事項

- **初回背景除去時**: 40MBのAIモデルをダウンロードします。通信環境に注意してください。
- **メモリ**: 大きな画像を処理する際は、自動でサイズを縮小して処理します。
- **ブラウザ**: Web Audio APIとWebAssemblyに対応したブラウザが必要です。
- **マイク許可**: マイクへのアクセス許可が必要です。

## ライセンス

**⚠️ 本プロジェクトは AGPL v3 ライセンスです。**

`@imgly/background-removal` ライブラリが GNU Affero General Public License v3 (AGPL) のため、本プロジェクトも同じライセンスで公開されています。

### 使用ライブラリのライセンス

- **@imgly/background-removal**: AGPL v3（コピーレフト）
- **@mediapipe/tasks-vision**: Apache-2.0
- **onnxruntime-web**: MIT
- **Vite**: MIT

### AGPL v3 について

- ソースコードを改変してネットワーク上で使用する場合、改変したソースコードを公開する必要があります
- 商用利用する場合は、ライセンス条項を遵守するか、IMG.LY (support@img.ly) に別ライセンスの問い合わせが必要です
- 詳細は `@imgly/background-removal` の [LICENSE.md](https://github.com/imgly/background-removal-js/blob/main/LICENSE.md) を参照してください

## 謝辞

- [MediaPipe](https://mediapipe.dev/) - Googleの顔認識ライブラリ
- [@imgly/background-removal](https://github.com/imgly/background-removal-js) - ブラウザ内背景除去ライブラリ
- [ONNX Runtime Web](https://onnxruntime.ai/) - WebAssembly推論エンジン
