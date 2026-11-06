# Notes for the next proof of concept

## MetaMask warns not to connect

MetaMask flags the site when the chip private key is in the page URL, and it asks the visitor not to connect. The warning shows twice: once when the phone opens the MetaMask in-app browser, and again when the wallet is asked to connect.

The key in that URL is the tag's key. Connect copies it into the query string (`?k=`) because MetaMask often drops the fragment (`#k=`). For a demo, the visitor continues past both warnings.

## Solution

We remove the `?k=`component and the NFC tag will be the private key plainly.

Website lives on its own domain (for now github, later own domain like `mazhlycan.com` or `mazhlycan.com/collections`... accesible by itself)

Website is gonna be now more collector oriented. The site will show different pages:

- Landing home: Users see a header with the name "MAZH SEASONS" and a button "Connect" (that connects wallet). Inside of the body there are 2 collections banners shown with an image each: "Lil Guys" and "Blue Wolves".
- Collector profile: After connecting the wallet, user can access to their profile. For now username is just the address wallet. They can click on their profile and see their owned collections from Mazh. Here they can also, on top of the collection click on "add item". That triggers an NFC scan from the browser (NDEFReader). If the browser lacks of such capability, it asks the user to give permission to camera (to instead scan a QR code the item might have with the same information). They can also edit their collector profile and put an artwork as the main one/first one appearing on their collector profile.
- Collections: If a user clicks on a banner of a collection on landing page, they see the whole collection. They can click on one item and they can see who owns what asset (wallet address of owner). They can click on the owner's profile and see their whole collection (their own collector profile). 

*Notes for future: Later on Smart Contracts will allow any user to requesta proof of ownership to any holder of any item. When this happens, a holder can issue a proof by signing a nonce twice: with their private key of their wallet holding the asset AND the private key of the asset, alongside a timestamp, proving they have physically there the item (useful for future interactions involving secondary marketplace trust).* 

## Show the artwork before the claim

The picture, name, and description should be on screen as soon as a tag is scanned, while the token still says unclaimed. The visitor can check that the picture matches the object in their hand before connecting a wallet.

The files are already on IPFS. `baseURI` plus the token id points at the metadata whether or not the token has been minted. The page currently waits for a claim because `ownerOf` and `tokenURI` revert until then, and it shows a placeholder instead.

## Solution
When deployed, since collections will be of smaller size given the physical limitation nature of seasons, the PBT will be already showing the image before mint. This requires a bigger gas fee when deploying to include the metadata since the beginning, but it's worth it and will not mean a much bigger expense.

## Writing the tags is slow

Each tag is written by hand, one URI at a time. For the next proof of concept, make that step smoother so a set of tags can be prepared without typing each key in separately.

## Partial solution

For now, since tags will only have the key, there is no need to restructure every URL individually for them. Later on a script with a NFC reader connected to the laptop, can be generated. For now, we just restructure to tag only containing the key for the new website model.

## Claim without a wallet

Claim fails when no wallet is connected. Pressing Claim in that state should send the visitor through Connect first. In Chrome or another browser with no injected wallet, that means the same step Connect already takes: open the page in MetaMask.

## Solution

With the new website design, users can only claim after connecting to the website, solving this issue by itself. This connected-disconnected model brings also more clarity on what can a user do without connecting (checking collections and ownership), and connecting (check their own collection, reorganize the order of their shown artworks on their collector profile, and claim new ones - in future prove they own one or ask other collectors to prove they own one).
