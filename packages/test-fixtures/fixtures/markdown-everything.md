---
title: MarkHere Markdown Everything
author: Test Fixture
---

# MarkHere Fixture

## Unicode heading – සිංහල தமிழ் 中文

## Duplicate

## Duplicate

Paragraph with **strong**, *emphasis*, ~~strikethrough~~, `inline code`, and https://example.com.

> Blockquote with [external link](https://example.com) and [local link](linked.md#Target-Heading).

- unordered
- [x] completed task
- [ ] open task

1. ordered
2. second

| Column A | Column B |
| --- | ---: |
| alpha | 42 |

```typescript
const unsafe = '<script>alert(1)</script>'
console.log(unsafe)
```

![Local image](images/example.png "Local")

Inline math $E = mc^2$.

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

```mermaid
flowchart LR
  A[Markdown] --> B[Safe Preview]
```

<div class="raw-test" onclick="alert(1)" style="background:url(https://invalid.example/x)">
  <strong>Sanitized raw HTML</strong>
  <script>alert('blocked')</script>
</div>

::: unknown-extension
This syntax must remain byte-for-byte in canonical Markdown even when preview treats it as ordinary text.
:::

## Target Heading

End.
