import React from "react";
import { CHANGELOG } from "../../../changelog";

export function ChangelogPage(): React.JSX.Element {
  return (
    <div className="settings-page changelog-page">
      <p className="settings-section-description">
        All notable changes to Bitbucket PR Reviewer are documented here. The format is based on{" "}
        <a href="https://keepachangelog.com/en/1.1.0/" target="_blank" rel="noreferrer">
          Keep a Changelog
        </a>
        , and this project adheres to{" "}
        <a href="https://semver.org/" target="_blank" rel="noreferrer">
          Semantic Versioning
        </a>
        .
      </p>
      {CHANGELOG.map((release) => (
        <section key={release.version} className="changelog-release">
          <h3>
            [{release.version}]
            {release.date && <span className="changelog-date"> - {release.date}</span>}
          </h3>
          {release.sections.map((section) => (
            <div key={section.heading} className="changelog-section">
              <h4 className={`changelog-heading changelog-heading-${section.heading.toLowerCase().replace(" ", "-")}`}>
                {section.heading}
              </h4>
              <ul>
                {section.items.map((item) => (
                  <li key={item.title}>
                    <strong>{item.title}</strong> &mdash; {item.description}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
