import { ButtonState, EntityEquippableComponent, EquipmentSlot, GameMode, InputButton, ItemCooldownComponent, ItemDurabilityComponent, ItemEnchantableComponent, Player, system, world } from "@minecraft/server";
const Shields = {
  // "custom_shield:custom_shield": (data) => {
  //     world.sendMessage("this is a script")
  // }
};
const shieldingPlayers = {};
function getHeldShield(player, withCooldown = true) {
  function isValidShield(item2) {
    if (!item2.hasComponent("custom_shield:shield")) return false;
    if (withCooldown) {
      const cooldownComp = item2.getComponent(ItemCooldownComponent.componentId);
      if (cooldownComp && cooldownComp.getCooldownTicksRemaining(player) > 0) return false;
    }
    return true;
  }
  const equippable = player.getComponent(EntityEquippableComponent.componentId);
  if (!equippable) return void 0;
  const offhand = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
  const offItem = offhand.getItem();
  if (offItem && isValidShield(offItem)) return { item: offItem, slot: offhand, hand: "off_hand" };
  const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
  const item = mainhand.getItem();
  if (item && isValidShield(item)) return { item, slot: mainhand, hand: "main_hand" };
  return void 0;
}
const delays = {};
const visualDelays = {};
const heldShield = {};
const animations = {};
const usingItem = {};
function runDelay(player, delay, visual = true) {
  if (delays[player.id]) system.clearRun(delays[player.id]);
  if (!visual) delete visualDelays[player.id];
  const playerId = player.id;
  const id = system.runTimeout(() => {
    delete delays[playerId];
  }, delay * 20);
  delays[playerId] = id;
  if (visual) {
    if (visualDelays[player.id]) system.clearRun(visualDelays[player.id]);
    const id2 = system.runTimeout(() => {
      delete visualDelays[playerId];
    }, delay * 20);
    visualDelays[playerId] = id2;
  }
}
system.runInterval(() => {
  var _a, _b, _c, _d;
  for (const player of world.getAllPlayers()) {
    const shield = getHeldShield(player);
    const delay = (_b = (_a = shield == null ? void 0 : shield.item.getComponent("custom_shield:shield")) == null ? void 0 : _a.customComponentParameters.params) == null ? void 0 : _b.delay;
    if ((shield == null ? void 0 : shield.item.typeId) !== heldShield[player.id]) {
      if (!(shield == null ? void 0 : shield.item)) {
        if (delays[player.id]) {
          system.clearRun(delays[player.id]);
          delete delays[player.id];
        }
      }
      if (delay !== void 0) runDelay(player, delay);
    }
    let anim = void 0;
    if (shield !== void 0 && player.isSneaking) {
      anim = `animation.custom_shield.player.shield_block_${shield.hand}`;
    }
    if (usingItem[player.id] || visualDelays[player.id] !== void 0 || !player.isSneaking || (!shield || ((_d = (_c = shield.item.getComponent(ItemCooldownComponent.componentId)) == null ? void 0 : _c.getCooldownTicksRemaining(player)) != null ? _d : 0) > 0)) {
      anim = void 0;
      if (animations[player.id]) {
        player.playAnimation(animations[player.id], { blendOutTime: 0, stopExpression: "return true;" });
        delete animations[player.id];
      }
    } else {
      if (animations[player.id] !== anim) {
        if (animations[player.id]) player.playAnimation(animations[player.id], { blendOutTime: 0, stopExpression: "return true;" });
        if (anim) {
          player.playAnimation(anim, { blendOutTime: 99999, stopExpression: "q.is_sneaking" });
        }
      }
    }
    animations[player.id] = anim;
    if (shield) {
      heldShield[player.id] = shield.item.typeId;
    } else delete heldShield[player.id];
    shieldingPlayers[player.id] = shield !== void 0 && player.isSneaking;
  }
});
world.afterEvents.playerButtonInput.subscribe((data) => {
  var _a, _b;
  if (data.button === InputButton.Sneak) {
    if (data.newButtonState === ButtonState.Pressed) {
      const shield = getHeldShield(data.player);
      const delay = (_b = (_a = shield == null ? void 0 : shield.item.getComponent("custom_shield:shield")) == null ? void 0 : _a.customComponentParameters.params) == null ? void 0 : _b.delay;
      if (delay !== void 0) runDelay(data.player, delay, false);
    } else {
      const currentDelay = delays[data.player.id];
      if (currentDelay) system.clearRun(currentDelay);
      delete delays[data.player.id];
    }
  }
});
world.afterEvents.playerSwingStart.subscribe((data) => {
  var _a, _b;
  if (!data.player.isSneaking) return;
  const shield = getHeldShield(data.player);
  const delay = (_b = (_a = shield == null ? void 0 : shield.item.getComponent("custom_shield:shield")) == null ? void 0 : _a.customComponentParameters.params) == null ? void 0 : _b.delay;
  if (delay !== void 0) runDelay(data.player, delay);
});
world.beforeEvents.entityHurt.subscribe((data) => {
  var _a, _b, _c, _d;
  if (!(data.hurtEntity instanceof Player)) return;
  const player = data.hurtEntity;
  if (!shieldingPlayers[player.id] || delays[player.id] !== void 0 || usingItem[player.id]) return;
  const playerLoc = player.location;
  const viewDir = player.getViewDirection();
  const viewDirLoc = {
    x: playerLoc.x + viewDir.x * 0.01,
    y: playerLoc.y,
    z: playerLoc.z + viewDir.z * 0.01
  };
  const damageLocation = (_c = (_a = data.damageSource.damagingEntity) == null ? void 0 : _a.location) != null ? _c : (_b = data.damageSource.damagingProjectile) == null ? void 0 : _b.location;
  if (!damageLocation) return;
  const pTotal = Math.abs(playerLoc.x - damageLocation.x) + Math.abs(playerLoc.y - damageLocation.y) + Math.abs(playerLoc.z - damageLocation.z);
  const vTotal = Math.abs(viewDirLoc.x - damageLocation.x) + Math.abs(viewDirLoc.y - damageLocation.y) + Math.abs(viewDirLoc.z - damageLocation.z);
  if (pTotal < vTotal) return;
  let disableShield = false;
  if (data.damageSource.damagingEntity) {
    if (data.damageSource.damagingEntity.typeId === "minecraft:vindicator") {
      disableShield = true;
    } else {
      const equippable = data.damageSource.damagingEntity.getComponent(EntityEquippableComponent.componentId);
      if ((_d = equippable == null ? void 0 : equippable.getEquipmentSlot(EquipmentSlot.Mainhand).getItem()) == null ? void 0 : _d.hasTag("minecraft:is_axe")) disableShield = true;
    }
  }
  system.run(() => {
    var _a2, _b2, _c2, _d2;
    const shield = getHeldShield(player);
    if (!shield) return;
    if (Shields[shield.item.typeId]) Shields[shield.item.typeId]({ event: data, item: shield.item, source: player, slot: shield.slot });
    if (shield.item.hasComponent(ItemDurabilityComponent.componentId)) {
      let damage = data.damage;
      if (damage > Math.floor(damage)) damage = Math.floor(damage);
      damage += 1;
      shield.slot.setItem(reduceDurability(player, shield.item, damage));
    }
    const comp = (_a2 = shield.item.getComponent("custom_shield:shield")) == null ? void 0 : _a2.customComponentParameters.params;
    if (comp.knockback && data.damageSource.damagingEntity && !data.damageSource.damagingProjectile) {
      const total = Math.abs(damageLocation.x - playerLoc.x) + Math.abs(damageLocation.z - playerLoc.z);
      try {
        data.damageSource.damagingEntity.applyKnockback({ x: (damageLocation.x - playerLoc.x) / total * ((_b2 = comp.knockback.x) != null ? _b2 : 0), z: (damageLocation.z - playerLoc.z) / total * ((_c2 = comp.knockback.x) != null ? _c2 : 0) }, (_d2 = comp.knockback.y) != null ? _d2 : 0.1);
      } catch (e) {
      }
    }
    const cooldown = shield.item.getComponent(ItemCooldownComponent.componentId);
    if (comp.block) player.dimension.playSound(comp.block, player.location);
    if (comp.command) player.runCommand(comp.command);
    if (cooldown !== void 0 && disableShield) {
      cooldown.startCooldown(player);
      if (comp.disable_sound) player.dimension.playSound(comp.disable_sound, player.location);
    }
  });
  data.cancel = true;
});
system.beforeEvents.startup.subscribe((data) => {
  data.itemComponentRegistry.registerCustomComponent("custom_shield:shield", {});
});
function reduceDurability(player, item, damage) {
  if (player.getGameMode() === GameMode.Creative) return item;
  const durComp = item.getComponent(ItemDurabilityComponent.componentId);
  if (!durComp) return item;
  const enchComp = item.getComponent(ItemEnchantableComponent.componentId);
  const unbreaking = enchComp == null ? void 0 : enchComp.getEnchantment("unbreaking");
  if (unbreaking !== void 0) {
    const chance = 100 / (unbreaking.level + 1);
    const random = Math.random() * 100;
    if (random >= 100 - chance) {
      if (durComp.damage + damage > durComp.maxDurability) {
        player.dimension.playSound("random.break", player.location);
        return void 0;
      } else {
        durComp.damage += damage;
        return item;
      }
    }
    return item;
  }
  if (durComp.damage + damage > durComp.maxDurability) {
    player.dimension.playSound("random.break", player.location);
    return void 0;
  } else {
    durComp.damage += damage;
    return item;
  }
}
world.afterEvents.playerLeave.subscribe((data) => {
  delete animations[data.playerId];
  delete heldShield[data.playerId];
  delete shieldingPlayers[data.playerId];
  delete usingItem[data.playerId];
});
world.afterEvents.itemStartUse.subscribe((data) => {
  usingItem[data.source.id] = true;
});
world.afterEvents.itemStopUse.subscribe((data) => {
  delete usingItem[data.source.id];
});
world.afterEvents.itemReleaseUse.subscribe((data) => {
  delete usingItem[data.source.id];
});
export {
  reduceDurability
};
