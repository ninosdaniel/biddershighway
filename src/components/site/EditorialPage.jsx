import Link from "next/link";
import parse from "html-react-parser";
import {
  authorImage,
  cleanEditorial,
  editorialHref,
  editorialPagination,
  EDITORIAL_TAGS,
} from "../../lib/site/editorial";
import { editorialCopy } from "../../lib/site/editorial-copy";
import { listingImage } from "../../lib/site/listings";
import { EditorialComments } from "./EditorialComments";

function DateLabel({ value, locale }) {
  return value ? (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeZone: "Europe/Stockholm",
      }).format(new Date(value))}
    </time>
  ) : null;
}
function Cards({ items, locale, collection = "posts" }) {
  return (
    <ul className="editorial-grid">
      {items.map((item) => (
        <li key={item.id}>
          <article>
            <Link href={editorialHref(locale, collection, item.slug)}>
              {item.thumbnail && (
                <img
                  src={listingImage(item.thumbnail)}
                  alt={item.name || ""}
                  loading="lazy"
                />
              )}
              <DateLabel value={item.published_at} locale={locale} />
              <h2>{item.name}</h2>
              <p>{item.excerpt}</p>
            </Link>
          </article>
        </li>
      ))}
    </ul>
  );
}
function Pagination({ data, locale }) {
  const pages = Math.ceil(data.total / data.page_size);
  if (pages <= 1) return null;
  const words = editorialCopy[locale];
  const path = editorialHref(
    locale,
    data.kind === "author" ? "authors" : data.kind,
    data.author?.slug,
  );
  return (
    <nav className="editorial-pagination" aria-label={words.pagination}>
      {data.page > 1 && (
        <Link
          rel="prev"
          href={editorialPagination(path, data.page - 1, data.tag)}
        >
          {words.previous}
        </Link>
      )}
      <span aria-current="page">
        {words.page} {data.page} / {pages}
      </span>
      {data.page < pages && (
        <Link
          rel="next"
          href={editorialPagination(path, data.page + 1, data.tag)}
        >
          {words.next}
        </Link>
      )}
    </nav>
  );
}
function Tags({ locale, selected }) {
  const words = editorialCopy[locale];
  return (
    <nav className="editorial-tags" aria-label={words.all}>
      <Link
        href={`/${locale}/posts`}
        aria-current={!selected ? "page" : undefined}
      >
        {words.all}
      </Link>
      {EDITORIAL_TAGS.map((tag) => (
        <Link
          key={tag}
          href={editorialPagination(`/${locale}/posts`, 1, tag)}
          aria-current={selected === tag ? "page" : undefined}
        >
          {words.tags[tag]}
        </Link>
      ))}
    </nav>
  );
}
export function EditorialPage({ data, locale }) {
  const words = editorialCopy[locale];
  const record = data.record;
  const detail = data.kind === "post" || data.kind === "page";
  return (
    <div className={`editorial-page editorial-${data.kind}`}>
      {detail ? (
        <>
          <nav className="editorial-breadcrumb">
            <Link
              href={`/${locale}/${data.kind === "post" ? "posts" : "pages"}`}
            >
              {data.kind === "post" ? words.all : words.pages}
            </Link>
            {data.parent && (
              <>
                <span aria-hidden="true"> / </span>
                <Link href={editorialHref(locale, "pages", data.parent.slug)}>
                  {data.parent.name}
                </Link>
              </>
            )}
          </nav>
          <article>
            <header className="editorial-heading">
              <h1>{record.name}</h1>
              {record.excerpt && (
                <p className="editorial-lead">{record.excerpt}</p>
              )}
              <div className="editorial-byline">
                {record.author && (
                  <Link
                    href={editorialHref(locale, "authors", record.author.slug)}
                  >
                    <img
                      src={authorImage(record.author.name)}
                      alt=""
                      width="40"
                      height="40"
                    />
                    {record.author.name}
                  </Link>
                )}
                <DateLabel value={record.published_at} locale={locale} />
              </div>
              {record.tags?.length > 0 && (
                <div className="editorial-tags">
                  {record.tags
                    .filter((tag) => EDITORIAL_TAGS.includes(tag))
                    .map((tag) => (
                      <Link
                        key={tag}
                        href={editorialPagination(`/${locale}/posts`, 1, tag)}
                      >
                        {words.tags[tag]}
                      </Link>
                    ))}
                </div>
              )}
            </header>
            {record.image && (
              <img
                className="editorial-main-image"
                src={listingImage(record.image)}
                alt={record.name || ""}
              />
            )}
            <div className="editorial-body">
              {parse(cleanEditorial(record.body, locale))}
            </div>
          </article>
          {data.kind === "post" && (
            <EditorialComments
              key={`${locale}:${record.id}`}
              postId={record.id}
              comments={data.comments}
              locale={locale}
            />
          )}
          {data.items?.length > 0 && (
            <section>
              <h2>{words.related}</h2>
              <Cards items={data.items} locale={locale} collection="pages" />
            </section>
          )}
        </>
      ) : (
        <>
          {data.author ? (
            <header className="editorial-author-heading">
              <img
                src={authorImage(data.author.name)}
                alt=""
                width="150"
                height="150"
              />
              <div>
                <h1>{data.author.name}</h1>
                <div className="editorial-body">
                  {parse(cleanEditorial(data.author.description, locale))}
                </div>
              </div>
            </header>
          ) : (
            <header className="editorial-heading">
              <h1>{words[data.kind]}</h1>
            </header>
          )}
          {data.hero && (
            <article className="editorial-hero">
              <Link href={editorialHref(locale, "posts", data.hero.slug)}>
                {data.hero.image && (
                  <img
                    src={listingImage(data.hero.image)}
                    alt={data.hero.name || ""}
                  />
                )}
                <div>
                  <DateLabel value={data.hero.published_at} locale={locale} />
                  <h2>{data.hero.name}</h2>
                  <p>{data.hero.excerpt}</p>
                  <span>{words.read} →</span>
                </div>
              </Link>
            </article>
          )}
          {data.kind === "posts" && (
            <Tags locale={locale} selected={data.tag} />
          )}
          {!data.items.length && !data.hero && (
            <p>{data.kind === "pages" ? words.emptyPages : words.empty}</p>
          )}
          <Cards
            items={data.items}
            locale={locale}
            collection={data.kind === "pages" ? "pages" : "posts"}
          />
          <Pagination data={data} locale={locale} />
          {data.podcasts?.length > 0 && (
            <section className="editorial-podcasts">
              <h2>{words.podcasts}</h2>
              <ul className="editorial-grid">
                {data.podcasts.map(
                  (podcast) =>
                    /^https?:\/\//i.test(podcast.link) && (
                      <li key={podcast.id}>
                        <a href={podcast.link} rel="noopener noreferrer">
                          {podcast.image && (
                            <img
                              src={listingImage(podcast.image)}
                              alt=""
                              loading="lazy"
                            />
                          )}
                          <h3>{podcast.name}</h3>
                          <p>{podcast.summary}</p>
                        </a>
                      </li>
                    ),
                )}
              </ul>
            </section>
          )}
        </>
      )}
      <div className="editorial-auctions">
        <Link href={`/${locale}/listings`}>{words.auctions} →</Link>
      </div>
    </div>
  );
}
