/**
 * Schema.org structured data, as JSON-LD for `<JsonLd>` or a page's
 * `schema` prop. Each builder returns the fields Google reads for that type,
 * with URLs made absolute against `SITE_URL`. Fields left `undefined` are
 * dropped when the data is serialized.
 */
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_SOCIALS,
  SITE_URL,
} from "../consts.ts";

export type Schema = Record<string, unknown>;

const absolute = (url: string) => new URL(url, SITE_URL).href;
const thing = (type: string, fields: Schema): Schema => ({
  "@context": "https://schema.org",
  "@type": type,
  ...fields,
});
const iso = (date?: Date) => date?.toISOString();

/** The business or person behind the site. Home page. */
export function organization(
  o: { name?: string; url?: string; logo?: string; sameAs?: string[] } = {},
): Schema {
  const sameAs = o.sameAs ?? SITE_SOCIALS;
  return thing("Organization", {
    name: o.name ?? SITE_NAME,
    url: absolute(o.url ?? "/"),
    logo: absolute(o.logo ?? "/apple-touch-icon.png"),
    sameAs: sameAs.length ? sameAs : undefined,
  });
}

/** The site itself, so search shows its name. Home page. */
export function website(): Schema {
  return thing("WebSite", {
    name: SITE_NAME,
    url: absolute("/"),
    description: SITE_DESCRIPTION,
  });
}

/** The trail from the home page to this page. `<Breadcrumbs>` emits it. */
export function breadcrumbList(items: { name: string; url: string }[]): Schema {
  return thing("BreadcrumbList", {
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absolute(item.url),
    })),
  });
}

/** A blog post, news story or case study. */
export function article(a: {
  headline: string;
  url: string;
  datePublished: Date;
  dateModified?: Date;
  description?: string;
  image?: string;
  author?: string;
  type?: "Article" | "BlogPosting" | "NewsArticle";
}): Schema {
  return thing(a.type ?? "Article", {
    headline: a.headline,
    description: a.description,
    image: a.image && absolute(a.image),
    datePublished: iso(a.datePublished),
    dateModified: iso(a.dateModified ?? a.datePublished),
    author: a.author
      ? { "@type": "Person", name: a.author }
      : { "@type": "Organization", name: SITE_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME },
    mainEntityOfPage: absolute(a.url),
  });
}

/** Questions and answers shown on the page, word for word. */
export function faqPage(items: { question: string; answer: string }[]): Schema {
  return thing("FAQPage", {
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  });
}

/** A physical location: an office, shop, clinic, restaurant. */
export function localBusiness(b: {
  name?: string;
  /** A schema.org LocalBusiness subtype, such as `Restaurant` or `Dentist`. */
  type?: string;
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry: string;
  };
  telephone?: string;
  email?: string;
  url?: string;
  image?: string;
  geo?: { latitude: number; longitude: number };
  /** Like `Mo-Fr 09:00-18:00`. */
  openingHours?: string[];
}): Schema {
  return thing(b.type ?? "LocalBusiness", {
    name: b.name ?? SITE_NAME,
    address: { "@type": "PostalAddress", ...b.address },
    telephone: b.telephone,
    email: b.email,
    url: absolute(b.url ?? "/"),
    image: b.image && absolute(b.image),
    geo: b.geo && { "@type": "GeoCoordinates", ...b.geo },
    openingHours: b.openingHours,
  });
}

/** Something sold, with its price. */
export function product(p: {
  name: string;
  url: string;
  description?: string;
  image?: string;
  sku?: string;
  brand?: string;
  offer?: {
    price: number | string;
    priceCurrency: string;
    availability?: "InStock" | "OutOfStock" | "PreOrder" | "Discontinued";
  };
}): Schema {
  return thing("Product", {
    name: p.name,
    description: p.description,
    image: p.image && absolute(p.image),
    sku: p.sku,
    brand: p.brand && { "@type": "Brand", name: p.brand },
    offers: p.offer && {
      "@type": "Offer",
      url: absolute(p.url),
      price: String(p.offer.price),
      priceCurrency: p.offer.priceCurrency,
      availability:
        p.offer.availability && `https://schema.org/${p.offer.availability}`,
    },
  });
}
