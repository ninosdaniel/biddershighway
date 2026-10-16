"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSupabase } from "../../lib/supabaseClient";
import { apiError, backendEnabled, websiteApi } from "../../lib/site/api";
import { editorialCopy } from "../../lib/site/editorial-copy";

export function EditorialComments({ postId, comments, locale }) {
  const words = editorialCopy[locale];
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [body, setBody] = useState("");
  const [parent, setParent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState(false);
  const attempt = useRef(null);
  const textarea = useRef(null);
  useEffect(() => {
    if (!backendEnabled()) return;
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => subscription.unsubscribe();
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy || !body.trim()) return;
    const input = {
      post_id: postId,
      body: body.trim(),
      parent_id: parent?.id || null,
    };
    const key = JSON.stringify(input);
    if (attempt.current?.key !== key)
      attempt.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setPosted(false);
    try {
      await websiteApi("post_comment", input, attempt.current.id);
      setBody("");
      setParent(null);
      attempt.current = null;
      setPosted(true);
      router.refresh();
    } catch (failure) {
      setError(apiError(failure, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="comments"
      className="editorial-comments"
      aria-labelledby="comments-heading"
    >
      <h2 id="comments-heading">{words.comments}</h2>
      {!comments.length && <p>{words.noComments}</p>}
      <ol className="editorial-comment-list">
        {comments.map((comment) => {
          const replyTo = comments.find(
            (entry) => entry.id === comment.parent_id,
          );
          return (
            <li key={comment.id} id={`comment-${comment.id}`}>
              <div className="editorial-byline">
                <strong>{comment.author}</strong>
                <time dateTime={comment.created_at}>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeZone: "Europe/Stockholm",
                  }).format(new Date(comment.created_at))}
                </time>
              </div>
              {replyTo && (
                <a href={`#comment-${replyTo.id}`}>
                  {words.replying} {replyTo.author}
                </a>
              )}
              <p className="editorial-comment-body">{comment.body}</p>
              {signedIn && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setParent(comment);
                    setPosted(false);
                    textarea.current?.focus();
                  }}
                >
                  {words.reply}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {signedIn ? (
        <form onSubmit={submit} className="editorial-comment-form">
          {parent && (
            <div>
              {words.replying} {parent.author}{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() => setParent(null)}
              >
                {words.cancel}
              </button>
            </div>
          )}
          <label htmlFor="article-comment">{words.comment}</label>
          <textarea
            ref={textarea}
            id="article-comment"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            required
            rows={5}
            disabled={busy}
          />
          <button type="submit" disabled={busy || !body.trim()}>
            {busy ? words.sending : words.send}
          </button>
        </form>
      ) : (
        <Link href={`/${locale}/sign_ins/new`}>{words.signIn}</Link>
      )}
      {error && <p role="alert">{error}</p>}
      {posted && <p role="status">{words.posted}</p>}
    </section>
  );
}
