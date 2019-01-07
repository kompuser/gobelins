import React, { Component } from "react";
import { Media } from "react-breakpoints";

import DetailMobile from "./DetailMobile.jsx";
import DetailDesktop from "./DetailDesktop.jsx";

class Detail extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    return (
      <Media>
        {({ breakpoints, currentBreakpoint }) =>
          breakpoints[currentBreakpoint] < breakpoints.small ? (
            <DetailMobile
              match={this.props.match}
              product={this.props.product}
              onBackToCollection={this.props.onBackToCollection}
            />
          ) : (
            <DetailDesktop
              match={this.props.match}
              product={this.props.product}
              onBackToCollection={this.props.onBackToCollection}
            />
          )
        }
      </Media>
    );
  }
}

export default Detail;
