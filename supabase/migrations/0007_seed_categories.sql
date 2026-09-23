-- カテゴリの初期データ（docs/04_data_model.md §10）
-- 正本: docs/04_data_model.md（この文書の SQL をそのまま実行順に分けたもの）。
-- 直すときは 04 と同じ変更で直す（04 が正本。CLAUDE.md §3）。

-- 初期データ（カテゴリ。仕様書 §8。name_hints は S-32 の推測に使う）
insert into public.categories (id, sort_order, name, icon, name_hints) values
  ('groceries',       1, '食料品',   'shopping-basket',  '{}'),
  ('dining',          2, '外食',     'utensils-crossed', '{}'),
  ('household_goods', 3, '日用品',   'spray-can',        '{}'),
  ('transport',       4, '交通',     'train-front',      '{駐車場}'),
  ('leisure',         5, 'レジャー', 'ticket',           '{}'),
  ('entertainment',   6, 'エンタメ', 'tv',               '{動画,音楽,配信,Netflix,Spotify}'),
  ('social',          7, '交際',     'gift',             '{}'),
  ('housing',         8, '住まい',   'building-2',       '{家賃,管理費}'),
  ('utilities',       9, '光熱費',   'lightbulb',        '{光熱,電気,ガス,水道}'),
  ('telecom',        10, '通信',     'wifi',             '{携帯,スマホ,光,回線,Wi-Fi,NHK}'),
  ('insurance',      11, '保険',     'shield',           '{保険}'),
  ('medical',        12, '医療',     'stethoscope',      '{病院,薬}'),
  ('big_purchase',   13, '大型出費', 'sofa',             '{家電,家具}'),
  ('tax',            14, '税金',     'landmark',         '{税,年金}'),
  ('other',          15, 'その他',   'ellipsis',         '{}');
