chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "openWebPage":
      handleOpenWebPage(message);
      break;
    case "addNewComment":
      handleAddNewComment(message);
      break;
    case "submitForm":
      handleSubmitForm(message, sendResponse);
      break;
    case "pageUrlUpdated":
      handlePageUrlUpdated(message, sendResponse);
      break;
    case "updateLoginUser":
      handleUpdateLoginUser(message);
      break;
  }
});

async function handleUpdateLoginUser(message) {
  const loginUser = message.user;

  await chrome.storage.local.set({ loginUser });
}

async function handleOpenWebPage(message) {
  await chrome.tabs.create({ url: `localhost:5173?token=${message.token}` });
}

async function handleAddNewComment(message) {
  const currentUrl = message.currentUrl;
  const userData = message.userData;
  const userFriends = userData.friends;
  const userIcon = userData.icon;

  await chrome.storage.local.set({
    currentUrl,
    userData,
    userFriends,
    userIcon,
  });

  chrome.scripting.executeScript({
    target: { tabId: message.tabId },
    files: ["addNewComment.js"],
  });
}

async function handleSubmitForm(message, sendResponse) {
  try {
    const imageDataUrl = await new Promise((resolve) => {
      chrome.tabs.captureVisibleTab(
        { format: "png", quality: 90 },
        (imageUrl) => {
          resolve(imageUrl);
        },
      );
    });

    const blob = await fetch(imageDataUrl).then((res) => res.blob());
    const screenshot = new File([blob], "screenshot.png", {
      type: "image/png",
    });

    const { currentUrl, userData } = await new Promise((resolve) => {
      chrome.storage.local.get(["currentUrl", "userData"], (result) => {
        resolve(result);
      });
    });

    const formData = new FormData();
    formData.append("userData", userData.email);
    formData.append("text", message.data.inputValue);
    formData.append("postDate", message.data.nowDate);
    formData.append("postUrl", currentUrl);
    formData.append(
      "postCoordinate",
      JSON.stringify(message.data.postCoordinate),
    );
    formData.append("allowPublic", message.data.allowPublic);
    formData.append("publicUsers", JSON.stringify(message.data.publicUsers));
    formData.append("recipientEmail", message.data.recipientEmail);
    formData.append("screenshot", screenshot);

    const response = await fetch("http://localhost:3000/comments/new", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      console.log("Fetch complited");
    } else {
      console.error("some problem with Fetch");
    }
  } catch (error) {
    console.error("An error:", error);
  }

  sendResponse("addNewComment has been arrived");
}

async function sendUserDataToServer(userId, pageUrl) {
  try {
    const serverEndpoint = `http://localhost:3000/location?userId=${encodeURIComponent(userId)}&pageUrl=${encodeURIComponent(pageUrl)}`;

    const response = await fetch(serverEndpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const responseData = await response.json();
    return responseData;
  } catch (error) {
    console.error(
      "Error occurred during data transmission to the server:",
      error,
    );
  }
}

async function handlePageUrlUpdated(message) {
  try {
    const pageUrl = message.url;
    const userId = await new Promise((resolve) => {
      chrome.storage.local.get(["loginUser"], (result) => {
        resolve(result.loginUser);
      });
    });

    const responseData = await sendUserDataToServer(userId, pageUrl);

    const responseComments = responseData.pageComments;
    console.log(responseComments);

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const activeTab = tabs[0];
      const message = {
        action: "sendDataToDisplayComments",
        data: responseComments,
      };

      chrome.tabs.sendMessage(activeTab.id, message, (response) => {
        console.log("Response from content script:", response);
      });
    });
  } catch (error) {
    console.error("Error occurred during data transmission:", error);
  }
}
