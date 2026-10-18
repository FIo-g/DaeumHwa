UPDATE "chapters" SET "title" = btrim(regexp_replace("title", '^\s*(?:제\s*)?\d+\s*화(?=$|[\s.:·\-–—)\]])[\s.:·\-–—)\]]*', ''), E' \t\r\n');
