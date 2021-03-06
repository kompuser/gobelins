import React, { useState, useEffect, Fragment } from "react";
import { Gateway } from "react-gateway";
import ReactModal2 from "react-modal2";
import classNames from "classnames";
import notifier from "../utils/notifier";

import Button from "../ui/Button";
import {
  useSelections,
  SelectionsContext
} from "../context/selections-context";
import { useAuth } from "../context/auth-context";
import AuthModal from "../Auth/AuthModal";
import SelectionsList from "./SelectionsList";
import SelectionsListItem from "./SelectionsListItem";
import SelectionInput from "./SelectionInput";
import Loader from "../Loader";
import Heart from "../icons/Heart";
import ArrowBottomRight from "../icons/ArrowBottomRight";
import SelectionsBlank from "../icons/SelectionsBlank";
import ImagesPlaceholder from "./ImagesPlaceholder";
import EditUserModal from "../Auth/EditUserModal";
import CrossSimple from "../icons/CrossSimple";

export default function MySelections(props) {
  //   const selectionsContext = useSelections();
  const authContext = useAuth();

  return authContext.data.authenticated ? (
    <MySelectionsList {...props} />
  ) : (
    <NotAuthenticated {...props} />
  );
}

function MySelectionsHeader(props) {
  const authContext = useAuth();
  const [selectionInputOpen, setSelectionInputOpen] = useState(false);
  const [editUserOpen, setEditUserOpen] = useState(false);

  function handleLogout() {
    const tok = document
      .querySelector("meta[name=csrf-token]")
      .getAttribute("content");
    authContext
      .logout({ csrfToken: tok })
      .then(() => {
        notifier("Vous avez bien été déconnecté.");
      })
      .catch(error => {
        notifier(
          "Une erreur est survenue, vous n’avez pas pu être déconnecté."
        );
      });
  }
  function openAddSelectionModal(ev) {
    setSelectionInputOpen(true);
  }
  function onCloseAddSelectionModal() {
    setSelectionInputOpen(false);
  }
  function openEditUserModal(ev) {
    document.documentElement.classList.add("prevent-scroll");
    setEditUserOpen(true);
  }
  function onCloseEditUserModal() {
    document.documentElement.classList.remove("prevent-scroll");
    setEditUserOpen(false);
  }

  return (
    <hgroup className={classNames("MySelections__header", props.className)}>
      <h1>Sélections de {authContext.data.user.name}</h1>
      <div className="MySelections__header-buttons">
        <Button
          round
          small
          dark
          icon="plus"
          onClick={openAddSelectionModal}
          className="MySelections__button"
        />
        <Button
          round
          small
          dark
          icon="gear"
          onClick={openEditUserModal}
          className="MySelections__button"
        />
        <Button
          small
          dark
          onClick={handleLogout}
          className="MySelections__button"
        >
          se déconnecter
        </Button>
      </div>

      {selectionInputOpen && (
        <SelectionInputModal onClose={onCloseAddSelectionModal} />
      )}
      {editUserOpen && <EditUserModal onClose={onCloseEditUserModal} />}
    </hgroup>
  );
}

function SelectionInputModal(props) {
  const selectionsContext = useSelections();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  useEffect(() => {
    document.documentElement.classList.add("prevent-scroll");
    return () => {
      document.documentElement.classList.remove("prevent-scroll");
    };
  });
  const handleSubmitNewSelection = name => {
    setLoading(true);
    selectionsContext.createAndAdd([], { name }).catch(error => {
      setLoading(false);
      setErrorMessage(error.message);
    });
  };
  return (
    <Gateway into="modal">
      <ReactModal2
        modalClassName="Modal__content SelectionModal__content"
        backdropClassName="Modal__overlay SelectionModal__overlay"
        onClose={props.onClose}
      >
        <>
          <button className="SelectionModal__close" onClick={props.onClose}>
            <CrossSimple />
          </button>
          <div className="SelectionModal__content-scrollable">
            <div className="SelectionModal__wrapper">
              {loading ? (
                <Loader />
              ) : (
                <SelectionInput
                  onSubmit={handleSubmitNewSelection}
                  errorMessage={errorMessage}
                  isFirst={false}
                />
              )}
            </div>
          </div>
        </>
      </ReactModal2>
    </Gateway>
  );
}

class MySelectionsList extends React.Component {
  static contextType = SelectionsContext;

  constructor(props) {
    super(props);
    this.state = {};
  }

  componentWillMount = () => {
    if (!this.context.loadingMine && !this.context.initedMine) {
      this.context.fetchMine();
    }
  };

  handleLoadMore = () => {
    if (this.context.hasMoreMySelections) {
      this.context.fetchMoreMine();
    }
  };

  render = () => {
    return (
      <div className="MySelections" ref={this.props.observeRef}>
        {this.context.loadingMine ? (
          <Loader className="SelectionsList__loader" />
        ) : this.context.mySelections &&
          this.context.mySelections.length > 0 ? (
          <div className="SelectionsList">
            <SelectionsList className="MySelections__list-item">
              {this.context.mySelections.map((sel, i) => (
                <Fragment key={sel.id}>
                  {(this.context.mySelections.length === 1 || i === 1) && (
                    <MySelectionsHeader className="SelectionsList__header SelectionsList__masonry-item" />
                  )}
                  <SelectionsListItem
                    selection={sel}
                    className="SelectionsList__masonry-item"
                    {...this.props}
                  />
                </Fragment>
              ))}
              {this.context.hasMoreMySelections && (
                <div
                  className="Selections__load-more is-mine SelectionsList__masonry-item"
                  key="load-more"
                >
                  {this.context.loadingMoreMine ? (
                    <Loader className="Selections__load-spinner" />
                  ) : (
                    <button
                      onClick={this.handleLoadMore}
                      type="button"
                      className="Selections__load-more-button"
                    >
                      <ArrowBottomRight />
                      <span className="Selections__load-more-button-text">
                        Voir plus
                      </span>
                    </button>
                  )}
                </div>
              )}
            </SelectionsList>
          </div>
        ) : (
          <UserHasNoSelections />
        )}
      </div>
    );
  };
}

function UserHasNoSelections(props) {
  return (
    <div className="SelectionsListBlankSlate">
      <div className="SelectionsListBlankSlate__top-left">
        <div className="SelectionsListBlankSlate__new">
          Créer votre première sélection
        </div>
      </div>
      <MySelectionsHeader className="SelectionsListBlankSlate__header" />
      <div className="SelectionsListBlankSlate__bottom-left">
        <div className="SelectionsListBlankSlate__label-heart">
          ou sauvegardez des objets en cliquant sur les
          <Heart />
        </div>
      </div>
      <SelectionsBlank className="SelectionsListBlankSlate__illu" />
    </div>
  );
}

function NotAuthenticated(props) {
  const selectionsContext = useSelections();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState("login");

  const handleRegisterClick = () => {
    setAuthModalMode("register");
    setAuthModalOpen(true);
  };
  const handleLoginClick = () => {
    setAuthModalMode("login");
    setAuthModalOpen(true);
  };
  const handleLoginCallback = () => {
    selectionsContext.fetchMine();
  };
  const handleRegisterCallback = () => {};
  const handleModalClose = () => {
    setAuthModalOpen(false);
  };
  const modalProps = {
    handleModalClose,
    authModalMode,
    handleLoginCallback,
    handleRegisterCallback,
    handleModalClose
  };
  return (
    <div className="MySelections" ref={props.observeRef}>
      <div className="MySelections__unauthenticated">
        <ImagesPlaceholder className="MySelections__blank-slate" />

        <h1 className="MySelections__auth-panel-title">
          Identifiez-vous pour consulter ou créer vos sélections d’objets
        </h1>
        <div className="MySelections__auth-panel-buttons">
          <Button onClick={handleRegisterClick} icon="arrow">
            créer un compte
          </Button>
          <Button onClick={handleLoginClick} icon="arrow">
            se connecter
          </Button>
        </div>
      </div>
      {authModalOpen && <NotAuthenticatedModal {...modalProps} />}
    </div>
  );
}

function NotAuthenticatedModal(props) {
  useEffect(() => {
    document.documentElement.classList.add("prevent-scroll");
    return () => {
      document.documentElement.classList.remove("prevent-scroll");
    };
  });
  return (
    <Gateway into="modal">
      <ReactModal2
        modalClassName="Modal__content SelectionModal__content"
        backdropClassName="Modal__overlay SelectionModal__overlay"
        onClose={props.handleModalClose}
      >
        <button
          className="SelectionModal__close"
          onClick={props.handleModalClose}
        >
          <CrossSimple />
        </button>
        <AuthModal
          action={props.authModalMode}
          onLogin={props.handleLoginCallback}
          onRegister={props.handleRegisterCallback}
          onCloseModal={props.handleModalClose}
        />
      </ReactModal2>
    </Gateway>
  );
}
