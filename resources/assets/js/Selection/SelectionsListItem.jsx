import React from "react";

import imageUrl from "../utils/image-url";
import classNames from "classnames";
import { Link } from "react-router-dom";

import ImagesPlaceholder from "./ImagesPlaceholder";
import PadlockTiny from "../icons/PadlockTiny";

export default function SelectionsListItem({ selection, className }) {
  const illustrativeImages = selection.images;

  return (
    <div className={classNames("SelectionsListItem", className)}>
      <Link
        className="SelectionsListItem__link"
        to={{
          pathname: `/selections/${selection.id}`,
          state: { selection: selection }
        }}
      >
        <div className="SelectionsListItem__images-wrapper">
          <div className="SelectionsListItem__images">
            {illustrativeImages.length ? (
              illustrativeImages.map((image, i) => {
                const width = illustrativeImages.length === 1 ? 1420 : 340;
                const thumbUrl = imageUrl(image.path, width, 720, {
                  crop: true
                });
                return <img src={thumbUrl} alt="" key={i} />;
              })
            ) : (
              <ImagesPlaceholder />
            )}
          </div>
        </div>
        <div className="SelectionsListItem__title-line">
          <strong className="SelectionsListItem__name">{selection.name}</strong>{" "}
          {Boolean(selection.products) &&
            Boolean(selection.products.length) && (
              <span className="SelectionsListItem__count">
                {selection.products.length} objet
                {selection.products.length > 1 ? "s" : ""}
              </span>
            )}{" "}
          <span>par {selection.users.map(u => u.name).join(", ")}</span>
          {selection.public !== true && <PadlockTiny />}
        </div>
        <div className="SelectionsListItem__desc">
          {selection.description &&
            selection.description.substring(0, 160) + "…"}
        </div>
      </Link>
    </div>
  );
}
