import Link from "next/link";
import parse, { attributesToProps, domToReact } from "html-react-parser";
import { cleanContent } from "../../lib/site/content";
import { BackendForm } from "./BackendForm";
import { Countdown } from "./Countdown";
import { ShopifyCollection } from "./ShopifyCollection";

export function ReferenceContent({ html, locale, backendEnabled = false }) {
  const options = {
    replace(node) {
      if (node.type !== "tag") return;
      const attributes = node.attribs || {};
      const props = attributesToProps(attributes);
      const children = () => domToReact(node.children || [], options);
      if (node.name === "main") return <>{children()}</>;
      if (attributes.id?.startsWith("collection-component-"))
        return <ShopifyCollection />;
      if (
        node.name === "a" &&
        attributes.href?.startsWith("/") &&
        !attributes.href.startsWith("//")
      ) {
        const { href, ...rest } = props;
        return (
          <Link {...rest} href={href} prefetch={false}>
            {children()}
          </Link>
        );
      }
      if (node.name === "form" && attributes.method?.toLowerCase() === "post") {
        return (
          <BackendForm
            action={attributes.action}
            className={attributes.class}
            locale={locale}
            backendEnabled={backendEnabled}
          >
            {children()}
          </BackendForm>
        );
      }
      if (node.name === "countdown-controller") {
        return (
          <Countdown
            end={attributes["data-countdown-closed-value"]}
            className={attributes.class}
          >
            {children()}
          </Countdown>
        );
      }
      if (node.name === "select") {
        const selected = (node.children || [])
          .filter(
            (child) => child.name === "option" && "selected" in child.attribs,
          )
          .map((child) => child.attribs.value);
        return (
          <select
            {...props}
            defaultValue={props.multiple ? selected : selected[0]}
          >
            {children()}
          </select>
        );
      }
      if (node.name === "option") {
        const { selected, ...rest } = props;
        return <option {...rest}>{children()}</option>;
      }
      if (node.name === "input") {
        const { value, checked, ...rest } = props;
        if (attributes.type === "checkbox" && !attributes.name) return <></>;
        return (
          <input {...rest} defaultValue={value} defaultChecked={checked} />
        );
      }
      if (node.name === "lite-youtube") {
        const id = attributes.videoid;
        if (!/^[\w-]{11}$/.test(id || "")) return <></>;
        return (
          <iframe
            className="site-video"
            title={attributes.playlabel || "Bidders Highway"}
            src={`https://www.youtube-nocookie.com/embed/${id}`}
            loading="lazy"
            allow="fullscreen; picture-in-picture"
            allowFullScreen
          />
        );
      }
      if (
        node.name === "input" &&
        attributes.type === "checkbox" &&
        !attributes.name
      )
        return <></>;
      if (node.name === "video")
        return (
          <video {...props} muted playsInline>
            {children()}
          </video>
        );
      if (node.name === "dialog") return <></>;
    },
  };
  return (
    <div className="site-content">
      {parse(cleanContent(html, locale), options)}
    </div>
  );
}
