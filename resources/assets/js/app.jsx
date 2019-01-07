import React, { Component } from "react";
import {
  BrowserRouter as Router,
  Route,
  Switch,
  withRouter
} from "react-router-dom";
import ReactBreakpoints from "react-breakpoints";
import qs from "qs";
import merge from "deepmerge";

import Collection from "./Collection/Collection";
import Detail from "./Detail/Detail";

const breakpoints = {
  xsmall: 800,
  small: 1024,
  medium: 1440,
  large: 1600,
  xlarge: 1800,
  xxlarge: 9999
};

class App extends Component {
  constructor(props) {
    super(props);

    const stateFromURL = this.extractSearchParams();

    this.state = {
      hits: [],
      currentPage: stateFromURL.currentPage || 1,
      isLoading: false,
      hasMore: false,
      totalHits: 0,
      filterObj: stateFromURL.filterObj || {},
      productDetail: false, // When in detail mode, hold the product data.
      scrollPosition: 0
    };

    this.searches = {};
    this.isLoadingNextPage = false;

    props.history.listen(this.historyEventListener.bind(this));

    this.extractSearchParams = this.extractSearchParams.bind(this);
    this.buildEndpointUrl = this.buildEndpointUrl.bind(this);
    this.handleLoading = this.handleLoading.bind(this);
    this.historyPushState = this.historyPushState.bind(this);
    this.loadFromRemote = this.loadFromRemote.bind(this);
    this.handleNextPageCallback = this.handleNextPageCallback.bind(this);
    this.handleAddFilter = this.handleAddFilter.bind(this);
    this.handleRemoveFilter = this.handleRemoveFilter.bind(this);
    this.handleFilterChange = this.handleFilterChange.bind(this);
    this.mergeAddedFilters = this.mergeAddedFilters.bind(this);
    this.mergeRemovedFilters = this.mergeRemovedFilters.bind(this);
    this.buildSearchParamsFromParams = this.buildSearchParamsFromParams.bind(
      this
    );
    this.buildSearchParamsFromState = this.buildSearchParamsFromState.bind(
      this
    );
    this.handleBackToCollection = this.handleBackToCollection.bind(this);
    this.handleObjectClick = this.handleObjectClick.bind(this);
  }

  historyEventListener(location, action) {
    // When using the 'back' button of the browser, we must
    // manually restore the state of the filters.
    if (location.pathname === "/recherche" && action === "POP") {
      const s = location.search;
      if (this.searches[s] && this.searches[s].isLoading === false) {
        this.setState(state => ({
          hits: this.searches[s].data.hits,
          hasMore: this.searches[s].data.hasMore,
          totalHits: this.searches[s].data.totalHits,
          currentPage: location.state.currentPage,
          filterObj: location.state.filterObj,
          isLoading: false
        }));
      }
    }
  }

  extractSearchParams() {
    let urlParams = qs.parse(window.location.search, {
      ignoreQueryPrefix: true,
      decoder(value) {
        if (/^(\d+|\d*\.\d+)$/.test(value)) {
          return parseFloat(value);
        }

        let keywords = {
          true: true,
          false: false,
          null: null,
          undefined: undefined
        };
        if (value in keywords) {
          return keywords[value];
        }

        return window.decodeURIComponent(value);
      }
    });
    let out = {};
    if (urlParams.page) {
      out.currentPage = urlParams.page;
      delete urlParams.page;
    }
    out.filterObj = { ...urlParams };
    return out;
  }

  loadFromRemote(searchURL) {
    return fetch(process.env.MIX_COLLECTION_DSN + searchURL, {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    }).then(response => response.json());
  }

  buildEndpointUrl() {
    return process.env.MIX_COLLECTION_DSN + this.buildSearchParamsFromState();
  }

  buildSearchParamsFromState() {
    return (
      "?" +
      qs.stringify(
        { ...this.state.filterObj, page: this.state.currentPage },
        { arrayFormat: "brackets", encodeValuesOnly: true }
      )
    );
  }

  buildSearchParamsFromParams(params) {
    return (
      "?" +
      qs.stringify(params, { arrayFormat: "brackets", encodeValuesOnly: true })
    );
  }

  historyPushState() {
    this.props.history.push(`/recherche${this.buildSearchParamsFromState()}`, {
      filterObj: this.state.filterObj,
      currentPage: this.state.currentPage
    });
    // window.scrollTo(0, 0);
  }

  handleLoading() {
    this.setState({ isLoading: true });
  }

  componentDidMount() {
    this.firstLoad();
  }

  firstLoad() {
    let searchUrl = this.buildSearchParamsFromState();
    this.searches[searchUrl] = {
      isLoading: true,
      data: {}
    };
    this.loadFromRemote(searchUrl).then(data => {
      this.searches[searchUrl].data = data;
      this.searches[searchUrl].isLoading = false;
      this.setState(
        {
          hits: data.hits,
          hasMore: data.hasMore,
          totalHits: data.totalHits
        },
        () => {
          this.props.history.replace(
            `/recherche${this.buildSearchParamsFromState()}`,
            {
              filterObj: this.state.filterObj,
              currentPage: this.state.currentPage
            }
          );
          window.scrollTo(0, 0);
        }
      );
    });
  }

  handleNextPageCallback() {
    // FIXME: this flag isn't stopping the page 2+3 problem…
    if (this.isLoadingNextPage || !this.state.hasMore) {
      return;
    }
    let pageToLoad = this.state.currentPage + 1;
    let nextPageUrl = this.buildSearchParamsFromParams({
      ...this.state.filterObj,
      page: pageToLoad
    });
    if (!this.searches.hasOwnProperty(nextPageUrl)) {
      this.searches[nextPageUrl] = {
        isLoading: true,
        data: {}
      };
      this.isLoadingNextPage = true;
      this.setState({ isLoading: true });

      this.loadFromRemote(nextPageUrl).then(data => {
        this.searches[nextPageUrl].data = data;
        this.searches[nextPageUrl].isLoading = false;
        this.setState(
          state => ({
            hits: state.hits.concat(data.hits),
            hasMore: data.hasMore,
            totalHits: data.totalHits,
            currentPage: pageToLoad,
            isLoading: false
          }),
          () => {
            this.historyPushState();
            this.isLoadingNextPage = false;
          }
        );
      });
    } else {
      if (this.searches[nextPageUrl].isLoading === true) {
        console.log("URL is loading, noop", nextPageUrl);
        return;
      } else {
        console.log("URL is already loaded, noop", nextPageUrl);
      }
    }
  }

  mergeAddedFilters(filterObj, currentStateFilterObj = null) {
    return merge(currentStateFilterObj || this.state.filterObj, filterObj);
  }

  mergeRemovedFilters(filterToRemove, currentStateFilterObj = null) {
    currentStateFilterObj = currentStateFilterObj || this.state.filterObj;
    let filterValueToAmend = currentStateFilterObj[filterToRemove.paramName];
    let filterObjAmended = currentStateFilterObj;
    if (filterValueToAmend instanceof Array) {
      filterToRemove.ids.map(id => {
        if (filterValueToAmend.indexOf(id) >= 0) {
          filterValueToAmend.splice(filterValueToAmend.indexOf(id), 1);
        }
      });

      if (filterValueToAmend.length > 0) {
        filterObjAmended[filterToRemove.paramName] = filterValueToAmend;
      } else {
        delete filterObjAmended[filterToRemove.paramName];
      }
    } else {
      let match;
      if (filterToRemove.paramName == "period_start_year") {
        // Periods
        delete filterObjAmended.period_start_year;
        delete filterObjAmended.period_end_year;
      } else if (
        // Dimensions
        (match = filterToRemove.paramName.match(/^([_a-z]+_)(l|g)te$/))
      ) {
        delete filterObjAmended[match[1] + "lte"];
        delete filterObjAmended[match[1] + "gte"];
      } else {
        // Other: query string, etc.
        delete filterObjAmended[filterToRemove.paramName];
      }
    }
    return filterObjAmended;
  }

  handleAddFilter(filterObj) {
    const mergedObj = this.mergeAddedFilters(filterObj);
    this.commitFilterChange(mergedObj);
  }

  handleFilterChange(addedFiltersObj, removedFiltersObj) {
    let filterObj;
    filterObj = this.mergeRemovedFilters(removedFiltersObj);
    filterObj = this.mergeAddedFilters(addedFiltersObj, filterObj);
    this.commitFilterChange(filterObj);
  }

  commitFilterChange(filterObj) {
    let searchUrl = this.buildSearchParamsFromParams({
      ...filterObj,
      page: 1
    });
    if (!this.searches.hasOwnProperty(searchUrl)) {
      this.searches[searchUrl] = {
        isLoading: true,
        data: {}
      };
      this.setState({ isLoading: true }, () => {
        this.loadFromRemote(searchUrl).then(data => {
          this.searches[searchUrl].data = data;
          this.searches[searchUrl].isLoading = false;
          this.setState(
            state => ({
              hits: data.hits,
              hasMore: data.hasMore,
              currentPage: 1,
              isLoading: false,
              totalHits: data.totalHits,
              filterObj: filterObj
            }),
            () => {
              this.historyPushState();
            }
          );
        });
      });
    } else {
      if (this.searches[searchUrl].isLoading === false) {
        this.setState(
          state => ({
            hits: this.searches[searchUrl].data.hits,
            hasMore: this.searches[searchUrl].data.hasMore,
            currentPage: 1,
            isLoading: false,
            filterObj: filterObj,
            totalHits: this.searches[searchUrl].data.totalHits
          }),
          () => {
            this.historyPushState();
          }
        );
      }
    }
  }

  isLoadingSearch(searchParams) {
    return (
      this.searches[searchParams] &&
      this.searches[searchParams].isLoading === true
    );
  }

  handleRemoveFilter(filterToRemove) {
    const filterObj = this.mergeRemovedFilters(filterToRemove);
    this.commitFilterChange(filterObj);
  }

  handleBackToCollection(event) {
    event.preventDefault();
    this.props.history.push(`/recherche${this.buildSearchParamsFromState()}`);
    setTimeout(() => {
      window.scrollTo(0, this.state.scrollPosition);
    }, 0);
  }

  handleObjectClick(product, event) {
    event.preventDefault();
    this.setState(
      { productDetail: product, scrollPosition: window.scrollY },
      () => {
        this.props.history.push(`/objet/${product.inventory_id}`);
        window.scrollTo(0, 0);
      }
    );
  }

  render() {
    return (
      <ReactBreakpoints
        breakpoints={breakpoints}
        debounceResize={true}
        debounceDelay={100}
      >
        <Switch>
          <Route
            path="/recherche"
            render={props => (
              <Collection
                {...props}
                onFilterAdd={this.handleAddFilter}
                onFilterRemove={this.handleRemoveFilter}
                onFilterChange={this.handleFilterChange}
                isLoadingURL={this.isLoadingSearch.bind(
                  this,
                  this.buildSearchParamsFromState()
                )}
                isLoading={this.state.isLoading}
                totalHits={this.state.totalHits}
                filterObj={this.state.filterObj}
                hits={this.state.hits}
                loadMore={this.handleNextPageCallback}
                hasMore={!this.state.isLoading && this.state.hasMore}
                currentPage={this.state.currentPage}
                onObjectClick={this.handleObjectClick}
              />
            )}
          />
          <Route
            path="/objet/:inventory_id"
            render={props => (
              <Detail
                {...props}
                product={this.state.productDetail}
                onBackToCollection={this.handleBackToCollection}
              />
            )}
          />
        </Switch>
      </ReactBreakpoints>
    );
  }
}

export default withRouter(App);
