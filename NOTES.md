# Notes for the next proof of concept

## MetaMask warns not to connect

MetaMask flags the site when the chip private key is in the page URL, and it asks the visitor not to connect. The warning shows twice: once when the phone opens the MetaMask in-app browser, and again when the wallet is asked to connect.

The key in that URL is the tag's key. Connect copies it into the query string (`?k=`) because MetaMask often drops the fragment (`#k=`). For a demo, the visitor continues past both warnings.

## Show the artwork before the claim

The picture, name, and description should be on screen as soon as a tag is scanned, while the token still says unclaimed. The visitor can check that the picture matches the object in their hand before connecting a wallet.

The files are already on IPFS. `baseURI` plus the token id points at the metadata whether or not the token has been minted. The page currently waits for a claim because `ownerOf` and `tokenURI` revert until then, and it shows a placeholder instead.

## Writing the tags is slow

Each tag is written by hand, one URI at a time. For the next proof of concept, make that step smoother so a set of tags can be prepared without typing each key in separately.
