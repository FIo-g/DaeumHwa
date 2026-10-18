UPDATE "chapters" SET "title" = btrim(regexp_replace("title", '^\s*(?:제\s*)?' || "position"::text || '\s*화(?=$|[\s.:·\-–—)\]])[\s.:·\-–—)\]]*', ''), E' \t\r\n');
