-- 0024_comment_images.DOWN.sql
-- Reverses 0024_comment_images.sql. Run in Supabase SQL Editor.

BEGIN;

-- 1) Remove JSONB grants from staff roles.
UPDATE roles
   SET permissions = (
     SELECT jsonb_agg(elem)
       FROM jsonb_array_elements(permissions) AS elem
      WHERE elem NOT IN ('"CREATE comment-images"'::jsonb, '"DELETE comment-images"'::jsonb)
   )
 WHERE name IN ('operador_organizacion', 'operador_sistema', 'admin_organizacion', 'admin_sistema');

-- 2) Remove permission catalog rows.
DELETE FROM permissions WHERE resource = 'comment-images';

-- 3) Drop the table (index drops automatically via ON DELETE CASCADE).
DROP TABLE IF EXISTS comment_images;

COMMIT;
